'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { useState } from 'react'

type ConfirmationModalProps = {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  message: React.ReactNode
}

export const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  message
}: ConfirmationModalProps) => {
  const [processing, setProcessing] = useState(false)

  const handleConfirm = async () => {
    if (processing) return

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
          <div className="mt-4 flex justify-end space-x-2">
            <Button onClick={onClose} variant="outline">
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={processing}
              variant="green"
            >
              {processing ? 'Processing...' : 'Confirm'}
            </Button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
