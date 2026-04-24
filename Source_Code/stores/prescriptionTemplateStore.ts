import { create } from 'zustand'
import type { PrescriptionTemplateConfig, TemplateSectionId } from '../lib/prescriptionTemplate'
import { createDefaultTemplate } from '../lib/prescriptionTemplate'

type TemplateStore = {
    template: PrescriptionTemplateConfig
    setTemplate: (template: PrescriptionTemplateConfig) => void
    setLayout: (layoutId: string, template: PrescriptionTemplateConfig) => void
    toggleSection: (id: TemplateSectionId) => void
    moveSection: (id: TemplateSectionId, direction: 'up' | 'down') => void
    setFontSize: (fontSize: PrescriptionTemplateConfig['fontSize']) => void
    setSignaturePosition: (position: PrescriptionTemplateConfig['signaturePosition']) => void
    setMarginColor: (color: string) => void
    setShowVitals: (enabled: boolean) => void
    setShowWatermark: (enabled: boolean) => void
    addCustomTextBlock: (text: string) => void
    removeCustomTextBlock: (id: string) => void
    addCustomImageBlock: (url: string) => void
    removeCustomImageBlock: (id: string) => void
    reset: () => void
}

export const usePrescriptionTemplateStore = create<TemplateStore>((set, get) => ({
    template: createDefaultTemplate(),

    setTemplate: (template) => set({ template }),

    setLayout: (layoutId, template) =>
        set({ template: { ...template, layoutId } }),

    toggleSection: (id) =>
        set((state) => ({
            template: {
                ...state.template,
                sections: state.template.sections.map((s) =>
                    s.id === id ? { ...s, enabled: !s.enabled } : s
                ),
            },
        })),

    moveSection: (id, direction) =>
        set((state) => {
            const sections = [...state.template.sections]
            const index = sections.findIndex((s) => s.id === id)
            if (index < 0) return state

            const target = direction === 'up' ? index - 1 : index + 1
            if (target < 0 || target >= sections.length) return state

            const [item] = sections.splice(index, 1)
            sections.splice(target, 0, item)

            return { template: { ...state.template, sections } }
        }),

    setFontSize: (fontSize) => set((state) => ({ template: { ...state.template, fontSize } })),
    setSignaturePosition: (position) => set((state) => ({ template: { ...state.template, signaturePosition: position } })),
    setMarginColor: (color) => set((state) => ({ template: { ...state.template, marginColor: color } })),
    setShowVitals: (enabled) => set((state) => ({ template: { ...state.template, showVitals: enabled } })),
    setShowWatermark: (enabled) => set((state) => ({ template: { ...state.template, showWatermark: enabled } })),

    addCustomTextBlock: (text) =>
        set((state) => ({
            template: {
                ...state.template,
                customTextBlocks: [
                    ...state.template.customTextBlocks,
                    { id: `txt_${Date.now()}`, text },
                ],
            },
        })),

    removeCustomTextBlock: (id) =>
        set((state) => ({
            template: {
                ...state.template,
                customTextBlocks: state.template.customTextBlocks.filter((b) => b.id !== id),
            },
        })),

    addCustomImageBlock: (url) =>
        set((state) => ({
            template: {
                ...state.template,
                customImageBlocks: [
                    ...state.template.customImageBlocks,
                    { id: `img_${Date.now()}`, url },
                ],
            },
        })),

    removeCustomImageBlock: (id) =>
        set((state) => ({
            template: {
                ...state.template,
                customImageBlocks: state.template.customImageBlocks.filter((b) => b.id !== id),
            },
        })),

    reset: () => set({ template: createDefaultTemplate() }),
}))
