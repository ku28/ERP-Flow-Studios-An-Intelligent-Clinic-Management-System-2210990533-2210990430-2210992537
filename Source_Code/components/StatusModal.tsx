import { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface StatusModalProps {
  isOpen: boolean
  status: 'loading' | 'success' | 'error'
  message: string
  onClose: () => void
  autoClose?: boolean
}

export default function StatusModal({
  isOpen,
  status,
  message,
  onClose,
  autoClose = true
}: StatusModalProps) {
  useEffect(() => {
    if (isOpen && status === 'success' && autoClose) {
      const timer = setTimeout(() => {
        onClose()
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [isOpen, status, autoClose, onClose])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen) return null

  const modal = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md animate-fadeIn">
      <div className="rounded-2xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-2xl shadow-blue-500/10 backdrop-blur-sm p-8 flex flex-col items-center space-y-6 min-w-[320px] max-w-md overflow-hidden animate-scaleIn">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-2xl"></div>
        <div className="relative w-full flex flex-col items-center space-y-6">
          {/* Status Icon */}
          <div className="relative w-20 h-20">
            {status === 'loading' && (
              <>
                {/* Outer rotating circle */}
                <div className="absolute inset-0 border-4 border-blue-200 dark:border-blue-900/50 rounded-full"></div>

                {/* Main rotating spinner */}
                <div className="absolute inset-0 border-4 border-transparent border-t-blue-500 dark:border-t-blue-400 rounded-full animate-spin"></div>

                {/* Inner pulsing dot */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-3 h-3 bg-blue-500 dark:bg-blue-400 rounded-full animate-pulse"></div>
                </div>

                {/* Secondary rotating ring */}
                <div className="absolute inset-0 border-4 border-transparent border-b-blue-300 dark:border-b-blue-600 rounded-full animate-spin-slow"></div>
              </>
            )}

            {status === 'success' && (
              <div className="relative w-20 h-20 animate-scale-check">
                {/* Circle background */}
                <div className="absolute inset-0 bg-sky-100 dark:bg-sky-900/30 rounded-full"></div>

                {/* Animated checkmark */}
                <svg
                  className="absolute inset-0 w-20 h-20 text-sky-600 dark:text-sky-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M5 13l4 4L19 7"
                    className="animate-draw-check"
                  />
                </svg>
              </div>
            )}

            {status === 'error' && (
              <div className="relative w-20 h-20 animate-shake">
                {/* Circle background */}
                <div className="absolute inset-0 bg-red-100 dark:bg-red-900/30 rounded-full"></div>

                {/* X mark */}
                <svg
                  className="absolute inset-0 w-20 h-20 text-red-600 dark:text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
            )}
          </div>

          {/* Message */}
          <div className="text-center">
            <p className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              {status === 'loading' && 'Processing...'}
              {status === 'success' && 'Success!'}
              {status === 'error' && 'Error'}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {message}
            </p>
          </div>

          {/* Close button for error state */}
          {status === 'error' && (
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg text-gray-800 dark:text-gray-200 font-medium transition-colors"
            >
              Close
            </button>
          )}
        </div>

        <style jsx>{`
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes scale-check {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          50% {
            transform: scale(1.1);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        
        @keyframes draw-check {
          0% {
            stroke-dasharray: 0, 100;
          }
          100% {
            stroke-dasharray: 100, 100;
          }
        }
        
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
        
        .animate-scaleIn {
          animation: scaleIn 0.3s ease-out;
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
        
        .animate-scale-check {
          animation: scale-check 0.5s ease-out;
        }
        
        .animate-draw-check {
          stroke-dasharray: 100;
          animation: draw-check 0.5s ease-out forwards;
        }
        
        .animate-shake {
          animation: shake 0.5s ease-out;
        }
        
        .animate-spin-slow {
          animation: spin 3s linear infinite reverse;
        }
      `}</style>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null
}

