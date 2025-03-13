import { NextResponse } from 'next/server'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import fs from 'fs'
import { spawn } from 'child_process'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

interface TranscriptionAnalysis {
  words_per_minute: number;
  total_duration: number;
  word_count: number;
  pauses: Array<{ duration: number; position: number }>;
  average_confidence: number;
  segments_count: number;
}

interface ComparisonResult {
  overall_score: number;
  detailed_scores: {
    pace_score: number;
    duration_score: number;
    confidence_score: number;
  };
  improvement_suggestions: string[];
}

interface TranscriptionResult {
  success: boolean;
  transcription: string | null;
  error?: string;
  analysis?: TranscriptionAnalysis;
  comparison?: ComparisonResult;
  timestamp?: string;
}

function runPythonScript(scriptPath: string, audioPath: string): Promise<TranscriptionResult> {
  return new Promise((resolve, reject) => {
    console.log('Starting Python process with:', {
      scriptPath,
      audioPath
    });

    const pythonProcess = spawn(join(process.cwd(), 'venv', 'bin', 'python'), [
      scriptPath,
      audioPath
    ]);

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      const error = data.toString();
      console.error('Python stderr:', error);
      stderr += error;
    });

    pythonProcess.on('close', (code) => {
      console.log('Python process exited with code:', code);
      if (code !== 0) {
        reject(new Error(`Python process exited with code ${code}\nError: ${stderr}`));
      } else {
        try {
          // Try to find and parse only the JSON part of the output
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            throw new Error('No JSON found in output');
          }
          const result = JSON.parse(jsonMatch[0]);
          resolve(result);
        } catch (error) {
          console.error('Raw stdout:', stdout);
          reject(new Error(`Failed to parse Python output: ${error}`));
        }
      }
    });

    pythonProcess.on('error', (err) => {
      console.error('Failed to start Python process:', err);
      reject(err);
    });
  });
}

async function analyzeSentiment(text: string): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "system",
        content: "You are an AI assistant specialized in analyzing customer support conversations. Your task is to evaluate a given chat or call transcript based on key performance metrics, provide a rating, and offer actionable insights for improvement.\n\n⸻\n\nEvaluation Criteria:\n\t1.\tConfidence (1-10): How assured and knowledgeable the customer support executive sounded.\n\t2.\tClarity (1-10): How well the executive explained solutions without confusion.\n\t3.\tEmpathy & Tone (1-10): How well the executive understood the customer’s concerns and responded in a professional, friendly manner.\n\t4.\tEfficiency (1-10): How quickly and effectively the issue was resolved.\n\t5.\tResolution Success (Yes/No): Whether the conversation ended with a resolved issue.\n\t6.\tCustomer Satisfaction (Predicted: High/Medium/Low): Based on sentiment analysis.\n\n⸻\n\nExpected Outputs\n\t1.\tOverall Rating (1-10): A weighted score based on the criteria above.\n\t2.\tSummary of the Conversation: A brief overview of what was discussed, key pain points, and resolutions provided.\n\t3.\tNext Steps & Recommendations: Actionable suggestions for the customer support executive to improve future conversations, if needed."
      },
      {
        role: "user",
        content: text
      }
    ]
  });

  return completion.choices[0].message.content || "No sentiment analysis available";
}

async function saveAnalysisToHistory(result: TranscriptionResult): Promise<void> {
  try {
    const historyDir = join(process.cwd(), 'history');
    await fs.promises.mkdir(historyDir, { recursive: true });
    
    const filename = `analysis_${Date.now()}.json`;
    await fs.promises.writeFile(
      join(historyDir, filename),
      JSON.stringify(result, null, 2),
      'utf-8'
    );
  } catch (error) {
    console.error('Failed to save analysis to history:', error);
  }
}

export async function POST(request: Request) {
  let tempAudioPath: string | undefined;
  
  try {
    console.log('Processing audio transcription request...');
    const formData = await request.formData()
    const audioFile = formData.get('audio') as File

    if (!audioFile) {
      console.log('No audio file provided');
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      )
    }

    console.log('Received audio file:', {
      name: audioFile.name,
      type: audioFile.type,
      size: audioFile.size
    });

    // Save the audio file temporarily
    const tempDir = '/tmp';
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    tempAudioPath = join(tempDir, `audio-${Date.now()}.wav`);
    await writeFile(tempAudioPath, audioBuffer);
    console.log('Saved temporary file at:', tempAudioPath);

    // Run the Python script for transcription
    const pythonScript = join(process.cwd(), 'python_backend', 'transcribe.py')
    console.log('Starting transcription with Python script at:', pythonScript);
    const result = await runPythonScript(pythonScript, tempAudioPath)
    
    console.log('Raw transcription result:', result);
    
    if (!result.success) {
      throw new Error(result.error || 'Transcription failed')
    }

    console.log('Transcription successful, starting sentiment analysis...');
    // Analyze sentiment using GPT
    const sentiment = await analyzeSentiment(result.transcription!)

    // Combine results
    const finalResult = {
      ...result,
      sentiment
    }

    // Save analysis to history
    await saveAnalysisToHistory(finalResult)

    // Clean up the temporary file
    if (tempAudioPath) {
      await unlink(tempAudioPath);
      console.log('Cleaned up temporary file:', tempAudioPath);
    }

    return NextResponse.json(finalResult)
  } catch (error) {
    console.error('Error in transcription process:', error);
    // Clean up temporary file in case of error
    if (tempAudioPath) {
      try {
        await unlink(tempAudioPath);
        console.log('Cleaned up temporary file:', tempAudioPath);
      } catch (cleanupError) {
        console.error('Failed to clean up temporary file:', cleanupError);
      }
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    )
  }
} 