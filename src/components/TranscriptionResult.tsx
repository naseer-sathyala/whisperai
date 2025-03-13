'use client'

import React from 'react';

interface SpeakerSegment {
  text: string;
  start: number;
  end: number;
  speaker: string;
  confidence: number;
}

interface SpeakerStats {
  word_count: number;
  total_duration: number;
  words_per_minute: number;
  average_confidence: number;
  pauses: Array<{ duration: number; position: number }>;
}

interface SpeakerAnalysis {
  speaker_segments: SpeakerSegment[];
  speaker_stats: Record<string, SpeakerStats>;
  total_speakers: number;
}

interface SpeakerScores {
  pace_score: number;
  confidence_score: number;
  pause_score: number;
  overall_score: number;
  historical_comparison?: {
    current_pace: number;
    historical_avg_pace: number;
    difference: number;
    historical_scores: Array<{
      score: number;
      timestamp: string;
    }>;
    average_historical_score: number;
  };
}

interface Comparison {
  overall_score: number;
  speaker_scores: Record<string, SpeakerScores>;
  improvement_suggestions: Record<string, string[]>;
}

interface HistoricalComparison {
  patterns: {
    avg_pace: number;
    avg_duration: number;
    successful_structures: Array<{
      speaker: string;
      duration: number;
    }>[];
    top_scores: Array<{
      score: number;
      timestamp: string;
    }>;
  };
}

interface TranscriptionResultProps {
  transcription: string;
  sentiment: string;
  speaker_analysis?: SpeakerAnalysis;
  comparison?: Comparison & {
    historical_comparison?: HistoricalComparison;
  };
}

const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const TranscriptionResult: React.FC<TranscriptionResultProps> = ({
  transcription,
  sentiment,
  speaker_analysis,
  comparison
}) => {
  return (
    <div className="space-y-6 p-6 bg-white rounded-lg shadow-lg">
      <div>
        <h2 className="text-2xl font-bold mb-4">Analysis Results</h2>
        
        {speaker_analysis && (
          <div className="mb-6">
            <h3 className="text-xl font-semibold mb-2">Conversation Transcript</h3>
            <div className="space-y-4">
              {speaker_analysis.speaker_segments.map((segment, index) => (
                <div 
                  key={index} 
                  className="p-4 rounded-lg"
                  style={{
                    backgroundColor: `hsl(${
                      parseInt(segment.speaker.replace(/\D/g, '')) * 137.5 % 360
                    }, 70%, 95%)`
                  }}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium">{segment.speaker}</span>
                    <span className="text-sm text-gray-500">
                      {formatTime(segment.start)} - {formatTime(segment.end)}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap">{segment.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {speaker_analysis && (
          <div className="mb-6">
            <h3 className="text-xl font-semibold mb-2">Speaker Analytics</h3>
            <div className="grid grid-cols-1 gap-6">
              {Object.entries(speaker_analysis.speaker_stats).map(([speaker, stats]) => (
                <div key={speaker} className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="text-lg font-medium mb-3">{speaker}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-3 bg-white rounded shadow-sm">
                      <p className="font-medium">Speaking Pace</p>
                      <p>{Math.round(stats.words_per_minute)} words/min</p>
                    </div>
                    <div className="p-3 bg-white rounded shadow-sm">
                      <p className="font-medium">Duration</p>
                      <p>{Math.round(stats.total_duration)} seconds</p>
                    </div>
                    <div className="p-3 bg-white rounded shadow-sm">
                      <p className="font-medium">Word Count</p>
                      <p>{stats.word_count} words</p>
                    </div>
                    <div className="p-3 bg-white rounded shadow-sm">
                      <p className="font-medium">Confidence</p>
                      <p>{Math.round(stats.average_confidence * 100)}%</p>
                    </div>
                  </div>

                  {comparison && comparison.speaker_scores[speaker] && (
                    <div className="mt-4">
                      <h5 className="font-medium mb-2">Performance Scores</h5>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-3 bg-white rounded shadow-sm">
                          <p className="font-medium">Pace Score</p>
                          <p>{Math.round(comparison.speaker_scores[speaker].pace_score * 100)}%</p>
                        </div>
                        <div className="p-3 bg-white rounded shadow-sm">
                          <p className="font-medium">Confidence Score</p>
                          <p>{Math.round(comparison.speaker_scores[speaker].confidence_score * 100)}%</p>
                        </div>
                        <div className="p-3 bg-white rounded shadow-sm">
                          <p className="font-medium">Pause Score</p>
                          <p>{Math.round(comparison.speaker_scores[speaker].pause_score * 100)}%</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {comparison && comparison.improvement_suggestions[speaker] && comparison.improvement_suggestions[speaker].length > 0 && (
                    <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
                      <p className="font-medium mb-2">Suggestions for Improvement</p>
                      <ul className="list-disc list-inside space-y-1">
                        {comparison.improvement_suggestions[speaker].map((suggestion, index) => (
                          <li key={index}>{suggestion}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {comparison && (
          <div className="mb-6">
            <h3 className="text-xl font-semibold mb-2">Overall Conversation Score</h3>
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">Overall Score</span>
                <span className="text-lg font-bold">{Math.round(comparison.overall_score)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full"
                  style={{ width: `${Math.round(comparison.overall_score)}%` }}
                ></div>
              </div>
            </div>
          </div>
        )}

        <div className="mb-6">
          <h3 className="text-xl font-semibold mb-2">Sentiment Analysis</h3>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="whitespace-pre-wrap">{sentiment}</p>
          </div>
        </div>
      </div>

      {comparison?.historical_comparison && (
        <div className="mb-6">
          <h3 className="text-xl font-semibold mb-2">Historical Comparison</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="text-lg font-medium mb-3">Performance Metrics</h4>
              <div className="space-y-4">
                <div>
                  <p className="font-medium">Average Pace (Historical)</p>
                  <p>{Math.round(comparison.historical_comparison.patterns.avg_pace)} words/min</p>
                </div>
                <div>
                  <p className="font-medium">Average Duration (Historical)</p>
                  <p>{Math.round(comparison.historical_comparison.patterns.avg_duration)} seconds</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="text-lg font-medium mb-3">Top Historical Scores</h4>
              <div className="space-y-2">
                {comparison.historical_comparison.patterns.top_scores.map((score, index) => (
                  <div key={index} className="flex justify-between items-center">
                    <span>{new Date(score.timestamp).toLocaleDateString()}</span>
                    <span className="font-medium">{Math.round(score.score)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {speaker_analysis && comparison.historical_comparison.patterns.successful_structures.length > 0 && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <h4 className="text-lg font-medium mb-3">Conversation Structure Analysis</h4>
              <div className="space-y-4">
                {Object.entries(speaker_analysis.speaker_stats).map(([speaker, stats]) => {
                  const historicalComparison = comparison.speaker_scores[speaker]?.historical_comparison;
                  if (!historicalComparison) return null;

                  return (
                    <div key={speaker} className="p-3 bg-white rounded shadow-sm">
                      <p className="font-medium">{speaker} - Pace Comparison</p>
                      <div className="grid grid-cols-2 gap-4 mt-2">
                        <div>
                          <p>Current Pace</p>
                          <p>{Math.round(historicalComparison.current_pace)} words/min</p>
                        </div>
                        <div>
                          <p>Historical Average</p>
                          <p>{Math.round(historicalComparison.historical_avg_pace)} words/min</p>
                        </div>
                      </div>
                      <div className="mt-2">
                        <p className="text-sm text-gray-600">
                          {historicalComparison.difference > 0
                            ? `Speaking ${Math.round(historicalComparison.difference)} words/min faster than average`
                            : `Speaking ${Math.round(Math.abs(historicalComparison.difference))} words/min slower than average`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {comparison?.speaker_scores && Object.entries(comparison.speaker_scores).map(([speaker, scores]) => (
        <div key={speaker} className="p-4 bg-gray-50 rounded-lg">
          <h4 className="text-lg font-medium mb-3">{speaker} Performance</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-white rounded shadow-sm">
              <p className="font-medium">Pace Score</p>
              <p className="text-2xl font-bold text-blue-600">{scores.pace_score}/10</p>
            </div>
            <div className="p-3 bg-white rounded shadow-sm">
              <p className="font-medium">Confidence Score</p>
              <p className="text-2xl font-bold text-green-600">{scores.confidence_score}/10</p>
            </div>
            <div className="p-3 bg-white rounded shadow-sm">
              <p className="font-medium">Pause Score</p>
              <p className="text-2xl font-bold text-purple-600">{scores.pause_score}/10</p>
            </div>
            <div className="p-3 bg-white rounded shadow-sm">
              <p className="font-medium">Overall Score</p>
              <p className="text-2xl font-bold text-orange-600">{scores.overall_score}/10</p>
            </div>
          </div>

          {scores.historical_comparison && (
            <div className="mt-4 p-4 bg-white rounded shadow-sm">
              <h5 className="text-md font-medium mb-2">Historical Comparison</h5>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Current Pace</p>
                  <p className="font-medium">{scores.historical_comparison.current_pace} words/min</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Historical Average Pace</p>
                  <p className="font-medium">{scores.historical_comparison.historical_avg_pace} words/min</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Pace Difference</p>
                  <p className={`font-medium ${scores.historical_comparison.difference > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {scores.historical_comparison.difference > 0 ? '+' : ''}{scores.historical_comparison.difference} words/min
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Average Historical Score</p>
                  <p className="font-medium">{scores.historical_comparison.average_historical_score}/10</p>
                </div>
              </div>
              
              {scores.historical_comparison.historical_scores.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm text-gray-600 mb-2">Previous Scores</p>
                  <div className="space-y-1">
                    {scores.historical_comparison.historical_scores.map((score, index) => (
                      <div key={index} className="flex justify-between items-center text-sm">
                        <span>{new Date(score.timestamp).toLocaleDateString()}</span>
                        <span className="font-medium">{score.score}/10</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default TranscriptionResult; 