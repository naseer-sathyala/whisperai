'use client'

import { useState } from 'react'
import AudioUploader from '@/components/AudioUploader'
import TranscriptionResult from '@/components/TranscriptionResult'

export default function Home() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transcription, setTranscription] = useState('')
  const [sentiment, setSentiment] = useState('')

  const handleUpload = async (file: File) => {
    setIsLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('audio', file)

      console.log('Starting audio upload and transcription...')
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process audio file')
      }

      if (data.error) {
        throw new Error(data.error)
      }

      console.log('Transcription completed:', data)
      setTranscription(data.transcription)
      setSentiment(data.sentiment)
    } catch (error) {
      console.error('Error:', error)
      setError(error instanceof Error ? error.message : 'Failed to process audio file')
      setTranscription('')
      setSentiment('')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-center mb-8">
        Audio Transcription & Analysis
      </h1>
      
      <div className="bg-white rounded-lg shadow-lg p-6">
        <AudioUploader onUpload={handleUpload} isLoading={isLoading} />
        
        {isLoading && (
          <div className="flex flex-col items-center justify-center my-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            <p className="mt-4 text-gray-600">Processing your audio... This may take a few minutes.</p>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {transcription && (
          <TranscriptionResult
            transcription={transcription}
            sentiment={sentiment}
          />
        )}
      </div>
    </div>
  )
} 