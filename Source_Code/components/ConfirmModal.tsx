import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

interface ConfirmDetailItem {
  title: string
  subtitle?: string
  meta?: string
  severity?: 'danger' | 'warning' | 'info'
}

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
  variant?: 'danger' | 'warning' | 'info'
  loading?: boolean
  twoStepMode?: 'auto-delete' | 'on' | 'off'
  stepOneConfirmText?: string
  secondStepTitle?: string
  secondStepMessage?: string
  detailsTitle?: string
  detailItems?: ConfirmDetailItem[]
  secondaryActionText?: string
  onSecondaryAction?: () => void
  secondaryActionLoading?: boolean
  secondaryActionVariant?: 'warning' | 'info'
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'warning',
  loading = false,
  twoStepMode = 'auto-delete',
  stepOneConfirmText = 'Continue',
  secondStepTitle,
  secondStepMessage,
  detailsTitle = 'Items impacted',
  detailItems = [],
  secondaryActionText,
  onSecondaryAction,
  secondaryActionLoading = false,
  secondaryActionVariant = 'info',
}: ConfirmModalProps) {
  const [step, setStep] = useState<1 | 2>(1)

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      setStep(1)
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || loading || secondaryActionLoading) return
    setStep((current) => current)
  }, [isOpen, loading, secondaryActionLoading])

  const destructiveByText = useMemo(() => {
    const content = `${title} ${message} ${confirmText}`.toLowerCase()
    return /(delete|remove|permanent|cannot be undone|irreversible)/.test(content)
  }, [title, message, confirmText])

  if (!isOpen) return null

  const isTwoStepEnabled =
    twoStepMode === 'on' ||
    (twoStepMode === 'auto-delete' && (variant === 'danger' || destructiveByText))

  const showSecondStep = isTwoStepEnabled && step === 2

  const variantColors = {
    danger: 'from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 shadow-red-500/30',
    warning: 'from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600',
    info: 'from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600'
  }

  const secondaryButtonColors = {
    warning: 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/25',
    info: 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/25',
  }

  const detailSeverityColors = {
    danger: 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300',
    warning: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300',
    info: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
  }

  const handlePrimaryAction = () => {
    if (isTwoStepEnabled && step === 1) {
      setStep(2)
      return
    }
    onConfirm()
  }

  const modal = (
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" style={{ zIndex: 9999 }}>
      <div className="relative overflow-hidden rounded-2xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/20 backdrop-blur-sm max-w-lg w-full animate-in fade-in zoom-in duration-200">
        <div className="absolute inset-0 bg-gradient-to-br from-red-400/5 via-transparent to-orange-500/5 pointer-events-none"></div>
        <div className="relative p-6">
          <h3 className="text-xl font-bold mb-3 text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-orange-600 dark:from-red-400 dark:to-orange-400">
            {showSecondStep ? (secondStepTitle || 'Final Confirmation') : title}
          </h3>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            {showSecondStep
              ? (secondStepMessage || 'This action is irreversible. Review impact details before proceeding.')
              : message}
          </p>

          {showSecondStep && detailItems.length > 0 && (
            <div className="mb-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-900/50 p-3 max-h-60 overflow-y-auto">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">{detailsTitle}</p>
              <div className="space-y-2">
                {detailItems.map((item, index) => {
                  const severity = item.severity || 'warning'
                  return (
                    <div key={`${item.title}-${index}`} className={`rounded-lg border px-3 py-2 ${detailSeverityColors[severity]}`}>
                      <p className="text-xs font-semibold leading-tight">{item.title}</p>
                      {item.subtitle && <p className="text-xs opacity-90 mt-1">{item.subtitle}</p>}
                      {item.meta && <p className="text-[11px] opacity-80 mt-1">{item.meta}</p>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button
              onClick={() => {
                if (showSecondStep) {
                  onCancel()
                  return
                }
                onCancel()
              }}
              disabled={loading || secondaryActionLoading}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelText}
            </button>

            {showSecondStep && secondaryActionText && onSecondaryAction && (
              <button
                onClick={onSecondaryAction}
                disabled={loading || secondaryActionLoading}
                className={`px-4 py-2 rounded-lg text-white font-medium transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${secondaryButtonColors[secondaryActionVariant]}`}
              >
                {secondaryActionLoading && (
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                {secondaryActionLoading ? 'Processing...' : secondaryActionText}
              </button>
            )}

            <button
              onClick={handlePrimaryAction}
              disabled={loading || secondaryActionLoading}
              className={`px-4 py-2 rounded-lg bg-gradient-to-r ${variantColors[variant]} text-white font-medium transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2`}
            >
              {loading && (
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              {loading ? 'Deleting...' : (showSecondStep ? confirmText : (isTwoStepEnabled ? stepOneConfirmText : confirmText))}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return modal
  return createPortal(modal, document.body)
}

