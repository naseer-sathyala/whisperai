'use client'

import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'

interface AudioUploaderProps {
  onUpload: (file: File) => void
  isLoading: boolean
}

export default function AudioUploader({ onUpload, isLoading }: AudioUploaderProps) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onUpload(acceptedFiles[0])
    }
  }, [onUpload])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/*': ['.mp3', '.wav', '.m4a', '.ogg']
    },
    maxFiles: 1,
    disabled: isLoading
  })

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
        ${isDragActive ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-primary'}`}
    >
      <input {...getInputProps()} />
      <div className="space-y-2">
        <div className="text-4xl mb-4">🎤</div>
        <p className="text-lg font-medium">
          {isDragActive
            ? 'Drop the audio file here'
            : 'Drag & drop an audio file here, or click to select'}
        </p>
        <p className="text-sm text-gray-500">
          Supported formats: MP3, WAV, M4A, OGG
        </p>
      </div>
    </div>
  )
} 