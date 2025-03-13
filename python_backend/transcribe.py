import whisper
import sys
import json
import logging
import os
from typing import Dict, Any, List
import numpy as np
from datetime import datetime
from pyannote.audio import Pipeline
from pydub import AudioSegment

# Configure logging to write to a file
log_file = os.path.join(os.path.dirname(__file__), 'transcribe.log')
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler(sys.stderr)
    ]
)
logger = logging.getLogger(__name__)

class CallAnalyzer:
    def __init__(self):
        self.model = None
        self.diarization_pipeline = None
        self.ideal_template = {
            "avg_confidence": 0.85,
            "ideal_pace": 150,  # words per minute
            "expected_duration": 180,  # seconds
            "key_phrases": [
                "greeting",
                "problem identification",
                "solution discussion",
                "next steps",
                "closing"
            ],
            "tone_markers": {
                "professional": 0.8,
                "confident": 0.7,
                "empathetic": 0.6
            }
        }
        self.history_dir = os.path.join(os.path.dirname(__file__), '..', 'history')
        os.makedirs(self.history_dir, exist_ok=True)
    
    def load_models(self):
        if self.model is None:
            logger.info("Loading Whisper model...")
            self.model = whisper.load_model("small")
            logger.info("Whisper model loaded successfully")
        
        if self.diarization_pipeline is None:
            logger.info("Loading diarization pipeline...")
            # You'll need to get an access token from HuggingFace
            self.diarization_pipeline = Pipeline.from_pretrained(
                "pyannote/speaker-diarization",
                use_auth_token=os.getenv("HUGGINGFACE_TOKEN")
            )
            logger.info("Diarization pipeline loaded successfully")
        
        return self.model, self.diarization_pipeline

    def perform_diarization(self, audio_path: str) -> List[Dict[str, Any]]:
        """Perform speaker diarization on the audio file."""
        try:
            diarization = self.diarization_pipeline(audio_path)
            
            # Convert diarization result to a list of segments with speaker info
            segments = []
            for turn, _, speaker in diarization.itertracks(yield_label=True):
                segments.append({
                    "start": turn.start,
                    "end": turn.end,
                    "speaker": speaker
                })
            
            # Identify the customer support speaker based on speaking duration and patterns
            speaker_durations = {}
            speaker_patterns = {}
            
            for segment in segments:
                speaker = segment["speaker"]
                duration = segment["end"] - segment["start"]
                speaker_durations[speaker] = speaker_durations.get(speaker, 0) + duration
                
                # Count common phrases for each speaker
                if speaker not in speaker_patterns:
                    speaker_patterns[speaker] = {
                        "support_phrases": 0,
                        "customer_phrases": 0
                    }
            
            # The speaker with the longest duration is likely the customer support
            if speaker_durations:
                support_speaker = max(speaker_durations.items(), key=lambda x: x[1])[0]
                
                # Relabel speakers
                for segment in segments:
                    if segment["speaker"] == support_speaker:
                        segment["speaker"] = "Customer Support"
                    else:
                        segment["speaker"] = "Customer"
            else:
                # If no speakers were identified, mark all segments as Customer Support
                for segment in segments:
                    segment["speaker"] = "Customer Support"
            
            logger.info(f"Identified speakers: {list(set(seg['speaker'] for seg in segments))}")
            return segments
            
        except Exception as e:
            logger.error(f"Error in diarization: {str(e)}")
            # Return a single segment marked as Customer Support in case of error
            return [{
                "start": 0,
                "end": 0,
                "speaker": "Customer Support"
            }]

    def merge_transcription_with_speakers(
        self, 
        transcription_segments: List[Dict[str, Any]], 
        speaker_segments: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Merge transcription segments with speaker information."""
        merged_segments = []
        
        # First, identify the Customer Support speaker based on speaking duration
        speaker_durations = {}
        for speaker_seg in speaker_segments:
            speaker = speaker_seg["speaker"]
            duration = speaker_seg["end"] - speaker_seg["start"]
            speaker_durations[speaker] = speaker_durations.get(speaker, 0) + duration
        
        # The speaker with the longest duration is likely the customer support
        support_speaker = max(speaker_durations.items(), key=lambda x: x[1])[0] if speaker_durations else None
        
        for trans_seg in transcription_segments:
            # Find the speaker segment that overlaps the most with this transcription
            seg_start = trans_seg["start"]
            seg_end = trans_seg["end"]
            max_overlap = 0
            assigned_speaker = "Unknown"
            
            for speaker_seg in speaker_segments:
                overlap_start = max(seg_start, speaker_seg["start"])
                overlap_end = min(seg_end, speaker_seg["end"])
                overlap = max(0, overlap_end - overlap_start)
                
                if overlap > max_overlap:
                    max_overlap = overlap
                    assigned_speaker = speaker_seg["speaker"]
            
            # If we found a speaker, label them appropriately
            if assigned_speaker != "Unknown":
                if assigned_speaker == support_speaker:
                    assigned_speaker = "Customer Support"
                else:
                    assigned_speaker = "Customer"
            
            merged_segments.append({
                **trans_seg,
                "speaker": assigned_speaker
            })
        
        # If no speakers were identified, try to identify based on content patterns
        if all(seg["speaker"] == "Unknown" for seg in merged_segments):
            for i, segment in enumerate(merged_segments):
                text = segment.get("text", "").lower()
                # Common customer support phrases
                support_phrases = ["hello", "hi", "sir", "madam", "thank you", "sorry", "please", "would you like", "can i help", "how can i assist"]
                # Common customer phrases
                customer_phrases = ["i want", "i need", "what is", "how does", "can you explain", "tell me", "i don't understand"]
                
                support_count = sum(1 for phrase in support_phrases if phrase in text)
                customer_count = sum(1 for phrase in customer_phrases if phrase in text)
                
                if support_count > customer_count:
                    segment["speaker"] = "Customer Support"
                elif customer_count > support_count:
                    segment["speaker"] = "Customer"
                else:
                    # If no clear pattern, alternate between speakers
                    segment["speaker"] = "Customer Support" if i % 2 == 0 else "Customer"
        
        return merged_segments

    def analyze_segments(self, result: Dict[str, Any], speaker_segments: List[Dict[str, Any]]) -> Dict[str, Any]:
        segments = result.get("segments", [])
        
        # Merge transcription with speaker information
        segments_with_speakers = self.merge_transcription_with_speakers(segments, speaker_segments)
        
        # Analyze per speaker
        speaker_stats = {}
        for segment in segments_with_speakers:
            speaker = segment["speaker"]
            if speaker not in speaker_stats:
                speaker_stats[speaker] = {
                    "word_count": 0,
                    "total_duration": 0,
                    "confidences": [],
                    "pauses": [],
                    "segments": []
                }
            
            # Update statistics for this speaker
            words = len(segment.get("text", "").split())
            duration = segment.get("end", 0) - segment.get("start", 0)
            confidence = segment.get("confidence", 0)
            
            speaker_stats[speaker]["word_count"] += words
            speaker_stats[speaker]["total_duration"] += duration
            speaker_stats[speaker]["confidences"].append(confidence)
            speaker_stats[speaker]["segments"].append(segment)
        
        # Calculate pauses between segments of the same speaker
        for speaker, stats in speaker_stats.items():
            sorted_segments = sorted(stats["segments"], key=lambda x: x["start"])
            for i in range(len(sorted_segments) - 1):
                current_seg = sorted_segments[i]
                next_seg = sorted_segments[i + 1]
                
                pause_duration = next_seg["start"] - current_seg["end"]
                if pause_duration > 1.0:  # Significant pause threshold
                    stats["pauses"].append({
                        "duration": pause_duration,
                        "position": current_seg["end"]
                    })
        
        # Calculate final metrics for each speaker
        for speaker, stats in speaker_stats.items():
            if stats["total_duration"] > 0:
                stats["words_per_minute"] = (stats["word_count"] / stats["total_duration"]) * 60
            else:
                stats["words_per_minute"] = 0
                
            if stats["confidences"]:
                stats["average_confidence"] = np.mean(stats["confidences"])
            else:
                stats["average_confidence"] = 0
        
        # Ensure we have at least one speaker identified as Customer Support
        if "Customer Support" not in speaker_stats:
            # Find the speaker with the longest duration
            longest_speaker = max(speaker_stats.items(), key=lambda x: x[1]["total_duration"])[0]
            # Rename that speaker to Customer Support
            speaker_stats["Customer Support"] = speaker_stats.pop(longest_speaker)
            # Update all segments to reflect the new speaker name
            for segment in segments_with_speakers:
                if segment["speaker"] == longest_speaker:
                    segment["speaker"] = "Customer Support"
        
        return {
            "speaker_segments": segments_with_speakers,
            "speaker_stats": speaker_stats,
            "total_speakers": len(speaker_stats)
        }

    def load_historical_data(self) -> List[Dict[str, Any]]:
        """Load historical call data for comparison."""
        historical_calls = []
        try:
            for filename in os.listdir(self.history_dir):
                if filename.endswith('.json'):
                    with open(os.path.join(self.history_dir, filename), 'r') as f:
                        data = json.load(f)
                        if data.get('success') and data.get('comparison', {}).get('overall_score', 0) > 70:
                            historical_calls.append(data)
            return sorted(historical_calls, key=lambda x: x.get('comparison', {}).get('overall_score', 0), reverse=True)[:5]
        except Exception as e:
            logger.error(f"Error loading historical data: {str(e)}")
            return []

    def analyze_historical_patterns(self, historical_calls: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze patterns from successful historical calls."""
        if not historical_calls:
            return {}

        patterns = {
            "avg_pace": 0,
            "avg_duration": 0,
            "common_phrases": set(),
            "successful_structures": [],
            "top_scores": []
        }

        for call in historical_calls:
            stats = call.get('speaker_analysis', {}).get('speaker_stats', {})
            for speaker_stats in stats.values():
                patterns["avg_pace"] += speaker_stats.get("words_per_minute", 0)
                patterns["avg_duration"] += speaker_stats.get("total_duration", 0)
            
            # Extract successful conversation structures
            segments = call.get('speaker_analysis', {}).get('speaker_segments', [])
            if segments:
                structure = self.extract_conversation_structure(segments)
                patterns["successful_structures"].append(structure)

            # Track top scores
            patterns["top_scores"].append({
                "score": call.get('comparison', {}).get('overall_score', 0),
                "timestamp": call.get('timestamp', '')
            })

        # Average out the metrics
        num_calls = len(historical_calls)
        if num_calls > 0:
            patterns["avg_pace"] /= num_calls
            patterns["avg_duration"] /= num_calls

        return patterns

    def extract_conversation_structure(self, segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Extract the conversation structure from segments."""
        structure = []
        current_speaker = None
        current_duration = 0
        
        for segment in segments:
            if segment["speaker"] != current_speaker:
                if current_speaker is not None:
                    structure.append({
                        "speaker": current_speaker,
                        "duration": current_duration
                    })
                current_speaker = segment["speaker"]
                current_duration = segment["end"] - segment["start"]
            else:
                current_duration += segment["end"] - segment["start"]
        
        if current_speaker is not None:
            structure.append({
                "speaker": current_speaker,
                "duration": current_duration
            })
        
        return structure

    def compare_with_ideal(self, analysis: Dict[str, Any]) -> Dict[str, Any]:
        # Load historical data for comparison
        historical_calls = self.load_historical_data()
        historical_patterns = self.analyze_historical_patterns(historical_calls)
        
        # Calculate overall metrics
        overall_stats = {
            "words_per_minute": 0,
            "total_duration": 0,
            "confidence": 0
        }
        
        speaker_scores = {}
        for speaker, stats in analysis["speaker_stats"].items():
            # Only analyze Customer Support speaker
            if speaker != "Customer Support":
                continue
                
            # Calculate individual speaker scores (1-10 scale)
            pace_score = max(0, 10 * (1 - abs(stats["words_per_minute"] - self.ideal_template["ideal_pace"]) / self.ideal_template["ideal_pace"]))
            confidence_score = 10 * stats["average_confidence"]
            pause_score = max(0, 10 * (1 - len(stats["pauses"]) / 5))  # Penalize if more than 5 long pauses
            
            # Ensure we have valid scores
            pace_score = round(pace_score, 2)
            confidence_score = round(confidence_score, 2)
            pause_score = round(pause_score, 2)
            overall_score = round((pace_score + confidence_score + pause_score) / 3, 2)
            
            speaker_scores[speaker] = {
                "pace_score": pace_score,
                "confidence_score": confidence_score,
                "pause_score": pause_score,
                "overall_score": overall_score
            }
            
            # Compare with historical patterns if available
            if historical_patterns:
                speaker_scores[speaker]["historical_comparison"] = {
                    "current_pace": round(stats["words_per_minute"], 2),
                    "historical_avg_pace": round(historical_patterns["avg_pace"], 2),
                    "difference": round(stats["words_per_minute"] - historical_patterns["avg_pace"], 2),
                    "historical_scores": historical_patterns.get("top_scores", []),
                    "average_historical_score": round(np.mean([score["score"] for score in historical_patterns.get("top_scores", [])]), 2) if historical_patterns.get("top_scores") else 0
                }
            
            # Update overall stats
            overall_stats["words_per_minute"] += stats["words_per_minute"]
            overall_stats["total_duration"] += stats["total_duration"]
            overall_stats["confidence"] += stats["average_confidence"]
        
        # Calculate overall scores (1-10 scale)
        overall_score = round(np.mean([
            max(0, 10 * (1 - abs(overall_stats["words_per_minute"] - self.ideal_template["ideal_pace"]) / self.ideal_template["ideal_pace"])),
            10 * overall_stats["confidence"]
        ]), 2)
        
        # If no Customer Support speaker was found, create a default score
        if not speaker_scores:
            speaker_scores["Customer Support"] = {
                "pace_score": 0,
                "confidence_score": 0,
                "pause_score": 0,
                "overall_score": 0
            }
        
        # Generate improvement suggestions
        improvement_suggestions = self.generate_suggestions(analysis, speaker_scores)
        
        # Log the scores for debugging
        logger.info(f"Calculated scores: {json.dumps(speaker_scores, indent=2)}")
        
        return {
            "overall_score": overall_score,
            "speaker_scores": speaker_scores,
            "improvement_suggestions": improvement_suggestions,
            "historical_comparison": {
                "patterns": historical_patterns,
                "top_scores": historical_patterns.get("top_scores", []),
                "successful_structures": historical_patterns.get("successful_structures", [])
            } if historical_patterns else None
        }

    def generate_suggestions(self, analysis: Dict[str, Any], speaker_scores: Dict[str, Dict[str, float]]) -> Dict[str, List[str]]:
        suggestions = {}
        
        for speaker, scores in speaker_scores.items():
            if speaker != "Customer Support":
                continue
                
            speaker_suggestions = []
            stats = analysis["speaker_stats"][speaker]
            
            if scores["pace_score"] < 7:
                if stats["words_per_minute"] > self.ideal_template["ideal_pace"]:
                    speaker_suggestions.append("Consider speaking more slowly for better clarity")
                else:
                    speaker_suggestions.append("Try to maintain a more engaging pace")
            
            if len(stats["pauses"]) > 5:
                speaker_suggestions.append("Consider reducing the number of long pauses")
            
            if scores["confidence_score"] < 7:
                speaker_suggestions.append("Work on speaking more confidently and clearly")
            
            suggestions[speaker] = speaker_suggestions
        
        return suggestions

    def transcribe_audio(self, audio_path: str) -> Dict[str, Any]:
        try:
            model, diarization_pipeline = self.load_models()
            
            # Perform speaker diarization
            logger.info("Starting speaker diarization...")
            speaker_segments = self.perform_diarization(audio_path)
            
            # Perform transcription
            logger.info("Starting transcription...")
            result = model.transcribe(audio_path)
            
            # Perform detailed analysis with speaker information
            analysis = self.analyze_segments(result, speaker_segments)
            comparison = self.compare_with_ideal(analysis)
            
            return {
                "success": True,
                "transcription": result["text"],
                "speaker_analysis": analysis,
                "comparison": comparison,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error during transcription: {str(e)}")
            return {
                "success": False,
                "transcription": None,
                "error": str(e)
            }

def main():
    if len(sys.argv) != 2:
        error_result = {
            "success": False,
            "error": "Audio file path not provided"
        }
        print(json.dumps(error_result))
        sys.exit(1)

    audio_path = sys.argv[1]
    if not os.path.exists(audio_path):
        error_result = {
            "success": False,
            "error": f"Audio file not found: {audio_path}"
        }
        print(json.dumps(error_result))
        sys.exit(1)

    analyzer = CallAnalyzer()
    result = analyzer.transcribe_audio(audio_path)
    # Ensure only the JSON result is printed to stdout
    print(json.dumps(result))

if __name__ == "__main__":
    main() 