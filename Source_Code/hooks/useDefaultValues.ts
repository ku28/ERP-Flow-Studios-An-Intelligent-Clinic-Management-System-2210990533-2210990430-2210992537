import { useState, useEffect } from 'react'

interface DefaultValues {
    [key: string]: any
}

const defaultValuesCache: { [page: string]: DefaultValues } = {}

export function useDefaultValues(pageName: string) {
    const [defaults, setDefaults] = useState<DefaultValues>(defaultValuesCache[pageName] || {})
    const [loading, setLoading] = useState(!defaultValuesCache[pageName])

    useEffect(() => {
        let cancelled = false

        if (defaultValuesCache[pageName]) {
            setDefaults(defaultValuesCache[pageName])
            setLoading(false)
        }

        const fetchDefaults = async () => {
            try {
                const response = await fetch('/api/admin/default-values')
                if (response.ok) {
                    const data = await response.json()
                    const pages = data.pages || []
                    
                    // Cache all pages
                    pages.forEach((page: any) => {
                        defaultValuesCache[page.page] = page.values || {}
                    })
                    
                    if (!cancelled) {
                        setDefaults(defaultValuesCache[pageName] || {})
                    }
                }
            } catch (error) {
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        fetchDefaults()

        return () => {
            cancelled = true
        }
    }, [pageName])

    return { defaults, loading }
}
