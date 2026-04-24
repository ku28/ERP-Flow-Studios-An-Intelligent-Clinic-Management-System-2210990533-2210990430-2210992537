import { ChangeEvent } from 'react'

export const useUppercaseInput = () => {
    /**
     * Transform input value to uppercase
     * @param e - Change event from input/textarea
     * @returns Uppercase string value
     */
    const toUpperCase = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): string => {
        return e.target.value.toUpperCase()
    }

    /**
     * Create an onChange handler that converts to uppercase
     * @param setter - State setter function
     * @param fieldName - Optional field name for object updates
     */
    const handleUppercaseChange = <T extends object>(
        setter: React.Dispatch<React.SetStateAction<T>>,
        fieldName?: keyof T
    ) => {
        return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            const upperValue = e.target.value.toUpperCase()

            if (fieldName) {
                // For form objects: setForm({ ...form, fieldName: value })
                setter((prev) => ({
                    ...prev,
                    [fieldName]: upperValue
                }))
            } else {
                // For simple state: setValue(value)
                setter(upperValue as any)
            }
        }
    }

    return {
        toUpperCase,
        handleUppercaseChange
    }
}

/**
 * Utility function to convert value to uppercase (can be used standalone)
 */
export const toUpperCase = (value: string): string => {
    return value?.toUpperCase() || ''
}

