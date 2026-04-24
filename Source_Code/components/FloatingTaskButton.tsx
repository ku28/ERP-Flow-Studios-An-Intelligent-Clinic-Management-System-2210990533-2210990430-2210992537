import { useState } from 'react'
import TaskSidebar from './TaskSidebar'

interface FloatingTaskButtonProps {
    userRole?: string
    hasOtherFloatingButton?: boolean
}

export default function FloatingTaskButton({ userRole, hasOtherFloatingButton = false }: FloatingTaskButtonProps) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)

    // Only show for admin and doctor roles
    if (!userRole || (userRole.toLowerCase() !== 'admin' && userRole.toLowerCase() !== 'doctor')) {
        return null
    }

    // Position changes based on whether there's another floating button
    const positionClass = hasOtherFloatingButton ? 'bottom-28' : 'bottom-6'

    return (
        <>
            <button
                onClick={() => setIsSidebarOpen(true)}
                className={`fixed ${positionClass} right-6 z-40 w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center group hover:scale-110 mobile-safe-fab mobile-safe-fab-secondary`}
                title="Assign Tasks / Send Messages"
            >
                <svg 
                    className="w-6 h-6 transform group-hover:scale-110 transition-transform" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                >
                    <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={2} 
                        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" 
                    />
                </svg>
            </button>

            <TaskSidebar 
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />
        </>
    )
}
