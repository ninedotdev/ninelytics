"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { IconTrash, IconAlertTriangle } from '@tabler/icons-react'
import { Spinner } from '@/components/ui/spinner'
import { api } from '@/utils/trpc'

interface DeletionProgressProps {
  websiteId: string
  onComplete: () => void
  onCancel: () => void
}

export function WebsiteDeletionProgress({ websiteId, onComplete, onCancel }: DeletionProgressProps) {
  const [progress, setProgress] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const deleteWebsite = api.websites.delete.useMutation({
    onSuccess() {
      setProgress(100)
      setTimeout(() => onComplete(), 500)
    },
    onError(err) {
      setError(err.message || 'Failed to delete website')
    },
    onSettled() {
      setIsDeleting(false)
    },
  })

  const startDeletion = async () => {
    setIsDeleting(true)
    setError(null)

    deleteWebsite.mutate({ id: websiteId })
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold">Deleting Website</h3>
        <p className="text-sm text-muted-foreground">
          This may take a while for websites with large amounts of data
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <IconAlertTriangle size={16} />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Deleting records...</span>
          <span>{progress}%</span>
        </div>
        <Progress value={progress} className="w-full" />
        <p className="text-xs text-muted-foreground text-center">
          {progress}% complete
        </p>
      </div>

      <div className="flex gap-2">
        {!isDeleting && (
          <Button onClick={startDeletion} variant="destructive" className="w-full">
            <IconTrash size={16} className="mr-2" />
            Confirm Deletion
          </Button>
        )}

        {isDeleting && (
          <Button disabled className="w-full">
            <Spinner size={16} className="mr-2" />
            Deleting...
          </Button>
        )}

        {(error || progress === 100) && (
          <Button onClick={onCancel} variant="outline" className="w-full">
            Close
          </Button>
        )}
      </div>
    </div>
  )
}
