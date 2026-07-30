'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { useEffect, useState } from 'react'

type ConfirmationModalProps = {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  message: React.ReactNode
  /** When set, Confirm stays disabled until this exact text is typed. For
   *  irreversible actions that destroy records. */
  confirmPhrase?: string
  /** Styles Confirm as a destructive action and relabels it. */
  destructive?: boolean
}

export const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  message,
  confirmPhrase,
  destructive = false
}: ConfirmationModalProps) => {
  const [processing, setProcessing] = useState(false)
  const [typed, setTyped] = useState('')

  // Never carry a satisfied phrase over into the next thing being confirmed.
  useEffect(() => {
    if (!isOpen) setTyped('')
  }, [isOpen])

  const phraseSatisfied = !confirmPhrase || typed.trim() === confirmPhrase

  const handleConfirm = async () => {
    if (processing || !phraseSatisfied) return

    setProcessing(true)
    try {
      await onConfirm() // ✅ Wait for async logic to finish
      onClose()
    } catch (err) {
      console.error('Confirm action failed:', err)
    } finally {
      setProcessing(false)
    }
  }

  if (!isOpen) return null

  return (
    <Dialog
      open={isOpen}
      as="div"
      className="relative z-50 focus:outline-none"
      onClose={() => {}}
    >
      {/* Background overlay */}
      <div
        className="fixed inset-0 bg-gray-600 opacity-80"
        aria-hidden="true"
      />

      {/* Centered panel container */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <DialogPanel
          transition
          className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg backdrop-blur-2xl"
        >
          <DialogTitle as="h3" className="text-base/7 font-medium">
            Confirmation
          </DialogTitle>
          <div className="mt-2">{message}</div>
          {confirmPhrase && (
            <div className="mt-4 space-y-1.5">
              <label
                htmlFor="confirm-phrase"
                className="block text-sm text-muted-foreground"
              >
                Type <span className="font-mono font-medium">{confirmPhrase}</span>{' '}
                to confirm
              </label>
              <Input
                id="confirm-phrase"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                className="font-mono"
              />
            </div>
          )}
          <div className="mt-4 flex justify-end space-x-2">
            <Button onClick={onClose} variant="outline">
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={processing || !phraseSatisfied}
              variant={destructive ? 'destructive' : 'green'}
            >
              {processing
                ? 'Processing...'
                : destructive
                  ? 'Delete permanently'
                  : 'Confirm'}
            </Button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
