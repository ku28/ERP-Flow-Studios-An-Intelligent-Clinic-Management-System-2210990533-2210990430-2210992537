import React from 'react'
import A4Page from './A4Page'
import type { PrescriptionTemplateConfig, TemplateSectionId } from '../../lib/prescriptionTemplate'

type RendererProps = {
    template: PrescriptionTemplateConfig
    clinicImages: { header?: string; footer?: string; watermark?: string; signature?: string }
    visitData: any
    prescriptions: any[]
    isPro: boolean
    forceWatermark?: boolean
}

const fontSizeMap = {
    small: '12px',
    medium: '13px',
    large: '14px',
}

function darkenColor(hex: string, percent: number = 0.25): string {
    const safe = (hex || '#3B82F6').replace('#', '')
    const num = parseInt(safe, 16)
    const r = Math.max(0, Math.floor((num >> 16) * (1 - percent)))
    const g = Math.max(0, Math.floor(((num >> 8) & 0x00FF) * (1 - percent)))
    const b = Math.max(0, Math.floor((num & 0x0000FF) * (1 - percent)))
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}

function sectionEnabled(template: PrescriptionTemplateConfig, id: TemplateSectionId): boolean {
    const section = template.sections.find((s) => s.id === id)
    return section ? section.enabled : true
}

function sectionGap(density: string | undefined): string {
    if (density === 'compact') return '6px'
    if (density === 'spacious') return '14px'
    return '10px'
}

export default function PrescriptionTemplateRenderer({
    template,
    clinicImages,
    visitData,
    prescriptions,
    isPro,
    forceWatermark = false,
}: RendererProps) {
    const images = {
        header: template.assets?.headerUrl || clinicImages.header || '',
        footer: template.assets?.footerUrl || clinicImages.footer || '',
        signature: template.assets?.signatureUrl || clinicImages.signature || '',
        watermark: template.assets?.watermarkUrl || clinicImages.watermark || '',
    }

    const patientName = [
        visitData?.patient?.firstName || '',
        visitData?.patient?.lastName || '',
    ].join(' ').trim()

    const sourceAssetBlocks = template.customImageBlocks || []
    const headerBlock = sourceAssetBlocks.find((block) => block.sourceAsset === 'header')
    const footerBlock = sourceAssetBlocks.find((block) => block.sourceAsset === 'footer')
    const signatureBlock = sourceAssetBlocks.find((block) => block.sourceAsset === 'signature')
    const watermarkBlock = sourceAssetBlocks.find((block) => block.sourceAsset === 'watermark')

    const imageTransformStyle = (block?: { fitMode?: 'contain' | 'cover'; cropX?: number; cropY?: number; zoom?: number }) => ({
        objectFit: block?.fitMode || 'contain',
        objectPosition: `${50 + (block?.cropX || 0)}% ${50 + (block?.cropY || 0)}%`,
        transform: `scale(${block?.zoom || 1})`,
        transformOrigin: 'center center',
    })

    const headerHeight = Math.max(90, Math.min(220, headerBlock?.height || 110))
    const footerHeight = Math.max(70, Math.min(180, footerBlock?.height || 90))
    const signatureWidth = Math.max(100, Math.min(280, signatureBlock?.width || 120))
    const signatureHeight = Math.max(40, Math.min(140, signatureBlock?.height || 60))

    const floatingImageBlocks = (template.customImageBlocks || []).filter(
        (b) => typeof b.x === 'number' && typeof b.y === 'number' && b.sourceAsset === 'custom'
    )

    const inlineImageBlocks = (template.customImageBlocks || []).filter(
        (b) => typeof b.x !== 'number' || typeof b.y !== 'number'
    )

    const orderedSections = template.sections.filter((section) => section.enabled)
        const shouldRenderWatermark =
            (forceWatermark || template.showWatermark) &&
            !!images.watermark &&
            (forceWatermark || sectionEnabled(template, 'watermark'))

    const isPatientCopyCurrent = template.layoutId === 'patient-copy-current' || template.layoutId === 'patient-copy-pro-color'
    const isPatientCopyProColor = template.layoutId === 'patient-copy-pro-color'
    const middleSections = orderedSections.filter(
        (section) => !['header', 'footer', 'signature', 'watermark'].includes(section.id)
    )
    const showHeader = sectionEnabled(template, 'header')
    const showSignature = sectionEnabled(template, 'signature')
    const showFooter = sectionEnabled(template, 'footer')

    const renderPatientCopyLabel = (title: string) => (
        <div style={{ position: 'relative', borderBottom: `1px solid ${isPatientCopyProColor ? '#FF8C00' : '#111111'}`, margin: '5px 0 10px 0', background: isPatientCopyProColor ? 'linear-gradient(to right, #ffffff, #e1c699)' : '#ffffff' }}>
            <span
                style={{
                    position: 'absolute',
                    top: '-8px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: isPatientCopyProColor ? 'linear-gradient(to right, #ffffff, #e1c699)' : '#ffffff',
                    padding: '0 6px 2px 6px',
                    color: '#111111',
                    fontWeight: 700,
                    fontSize: '11px',
                }}
            >
                {title}
            </span>
        </div>
    )

    const renderMiddleSection = (id: TemplateSectionId) => {
        if (id === 'patientInfo') {
            return (
                <section key="patientInfo" className="border rounded p-3" style={{ marginBottom: sectionGap(template.sectionHeights.patientInfo) }}>
                    <h4 className="font-semibold mb-2">Patient Info</h4>
                    <div className="grid grid-cols-2 gap-2 text-[12px]">
                        <div><strong>OPD:</strong> {visitData?.opdNo || '-'}</div>
                        <div><strong>Date:</strong> {visitData?.date ? new Date(visitData.date).toLocaleDateString() : '-'}</div>
                        <div><strong>Name:</strong> {patientName || '-'}</div>
                        <div><strong>Age/Gender:</strong> {visitData?.age || '-'} / {visitData?.gender || '-'}</div>
                        <div className="col-span-2"><strong>Phone:</strong> {visitData?.patient?.phone || visitData?.phone || '-'}</div>
                        <div className="col-span-2"><strong>Address:</strong> {visitData?.patient?.address || visitData?.address || '-'}</div>
                    </div>
                </section>
            )
        }

        if (id === 'vitals') {
            if (!template.showVitals) return null
            return (
                <section key="vitals" className="border rounded p-3" style={{ marginBottom: sectionGap(template.sectionHeights.vitals) }}>
                    <h4 className="font-semibold mb-2">Vitals</h4>
                    <div className="grid grid-cols-4 gap-2 text-[12px]">
                        <div><strong>Temp:</strong> {visitData?.temperament || '-'}</div>
                        <div><strong>Pulse 1:</strong> {visitData?.pulseDiagnosis || '-'}</div>
                        <div><strong>Pulse 2:</strong> {visitData?.pulseDiagnosis2 || '-'}</div>
                        <div><strong>Weight:</strong> {visitData?.weight || '-'}</div>
                    </div>
                </section>
            )
        }

        if (id === 'notes') {
            return (
                <section key="notes" className="border rounded p-3" style={{ marginBottom: sectionGap(template.sectionHeights.notes) }}>
                    <h4 className="font-semibold mb-2">Notes</h4>
                    <div className="text-[12px] whitespace-pre-wrap">
                        {visitData?.majorComplaints || '-'}
                    </div>
                </section>
            )
        }

        if (id === 'diagnosis') {
            return (
                <section key="diagnosis" className="border rounded p-3" style={{ marginBottom: sectionGap(template.sectionHeights.diagnosis) }}>
                    <h4 className="font-semibold mb-2">Provisional Diagnosis</h4>
                    <div className="text-[12px] whitespace-pre-wrap">{visitData?.provisionalDiagnosis || visitData?.diagnoses || '-'}</div>
                </section>
            )
        }

        if (id === 'prescriptionTable') {
            return (
                <section key="prescriptionTable" className="border rounded p-3" style={{ marginBottom: sectionGap(template.sectionHeights.prescriptionTable) }}>
                    <h4 className="font-semibold mb-2">Prescription</h4>
                    <div className="overflow-x-auto">
                        <table className="w-full text-[12px] border-collapse">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-left py-1">Medicine</th>
                                    <th className="text-left py-1">Dose</th>
                                    <th className="text-left py-1">Time</th>
                                    <th className="text-left py-1">Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(prescriptions || []).map((p: any, idx: number) => (
                                    <tr key={p.id || idx} className="border-b align-top">
                                        <td className="py-1 pr-2">{p.product?.name || p.productName || '-'}</td>
                                        <td className="py-1 pr-2">{p.dosage || '-'}</td>
                                        <td className="py-1 pr-2">{p.timing || '-'}</td>
                                        <td className="py-1">{p.procedure || p.notes || '-'}</td>
                                    </tr>
                                ))}
                                {(!prescriptions || prescriptions.length === 0) && (
                                    <tr><td colSpan={4} className="py-2 text-gray-400">No medicines added.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            )
        }

        if (id === 'customText') {
            if (!template.customTextBlocks.length) return null
            return (
                <React.Fragment key="customText">
                    {template.customTextBlocks.map((b) => (
                        <section key={b.id} className="border rounded p-3 text-[12px] whitespace-pre-wrap">
                            {b.text}
                        </section>
                    ))}
                </React.Fragment>
            )
        }

        if (id === 'customImage') {
            if (!inlineImageBlocks.length) return null
            return (
                <React.Fragment key="customImage">
                    {inlineImageBlocks.map((b) => (
                        <section key={b.id} className="border rounded p-2">
                            <div className="w-full h-[120px] overflow-hidden rounded" style={{ backgroundColor: '#ffffff' }}>
                                <img
                                    src={b.url}
                                    alt={b.alt || 'Custom'}
                                    className="w-full h-full"
                                    style={{
                                        objectFit: b.fitMode || 'contain',
                                        objectPosition: `${50 + (b.cropX || 0)}% ${50 + (b.cropY || 0)}%`,
                                        transform: `scale(${b.zoom || 1})`,
                                        transformOrigin: 'center center',
                                    }}
                                />
                            </div>
                        </section>
                    ))}
                </React.Fragment>
            )
        }

        return null
    }

    return (
        <A4Page marginColor={isPro ? template.marginColor : '#111111'}>
            {shouldRenderWatermark && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ zIndex: 0 }}>
                    <img
                        src={images.watermark}
                        alt=""
                        style={{
                            width: watermarkBlock?.width ? `${watermarkBlock.width}px` : '60%',
                            height: watermarkBlock?.height ? `${watermarkBlock.height}px` : '70%',
                            maxHeight: '70%',
                            opacity: 0.175,
                            ...imageTransformStyle(watermarkBlock),
                        }}
                    />
                </div>
            )}

            {floatingImageBlocks.map((b) => (
                <div
                    key={b.id}
                    className="absolute pointer-events-none"
                    style={{
                        left: `${b.x}px`,
                        top: `${b.y}px`,
                        width: `${b.width || 180}px`,
                        height: `${b.height || 90}px`,
                        zIndex: 2,
                    }}
                >
                    <div className="w-full h-full overflow-hidden">
                        <img
                            src={b.url}
                            alt={b.alt || 'Custom'}
                            className="w-full h-full"
                            style={{
                                objectFit: b.fitMode || 'contain',
                                objectPosition: `${50 + (b.cropX || 0)}% ${50 + (b.cropY || 0)}%`,
                                transform: `scale(${b.zoom || 1})`,
                                transformOrigin: 'center center',
                            }}
                        />
                    </div>
                </div>
            ))}

            {isPatientCopyCurrent ? (
                <div className="relative flex h-full flex-col" style={{ zIndex: 1, minHeight: 'calc(1123px - 40px)', fontSize: fontSizeMap[template.fontSize], color: '#111111' }}>
                    {showHeader ? (
                        <div className="w-full overflow-hidden" style={{ marginBottom: '1rem', backgroundColor: '#ffffff', height: `${headerHeight}px` }}>
                            {images.header ? (
                                <img src={images.header} alt="Header" className="block h-full w-full" style={imageTransformStyle(headerBlock)} />
                            ) : (
                                <div className="h-[110px] w-full border rounded flex items-center justify-center text-gray-400">Header</div>
                            )}
                        </div>
                    ) : (
                        <div style={{ height: '110px' }} />
                    )}

                    <div style={{ padding: '0 1.5rem', position: 'relative', flex: '1 1 auto' }}>
                        <div style={{ display: 'flex', gap: '5px', marginBottom: '15px' }}>
                            <div style={{ flex: 1, position: 'relative', padding: '10px 8px 6px 8px' }}>
                                {renderPatientCopyLabel('Particulars')}
                                <div style={{ width: '30px', height: '15px', background: visitData?.improvements ? darkenColor('#3B82F6', 0.25) : 'red', border: '1px solid #111111', marginBottom: '2px' }} />
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', fontSize: '10px', lineHeight: 1.1, marginTop: '7px' }}>
                                    <div><strong>SEX:</strong> {visitData?.gender || <span style={{ color: '#FF0000' }}>N/A</span>}</div>
                                    <div><strong>VISIT:</strong> {visitData?.visitNumber || '1'}</div>
                                    <div><strong>DOB:</strong> {visitData?.dob ? new Date(visitData.dob).toLocaleDateString('en-GB') : <span style={{ color: '#FF0000' }}>N/A</span>}</div>
                                    <div><strong>AGE:</strong> {visitData?.age || <span style={{ color: '#FF0000' }}>N/A</span>}</div>
                                    <div><strong>HT:</strong> {visitData?.height || <span style={{ color: '#FF0000' }}>N/A</span>}</div>
                                    <div><strong>FOLLOW UP:</strong> <span style={{ color: '#C80000', fontWeight: 'bold' }}>{visitData?.followUpCount ? `#${visitData.followUpCount}` : <span style={{ color: '#FF0000' }}>N/A</span>}</span></div>
                                    <div><strong>WT:</strong> {visitData?.weight || <span style={{ color: '#FF0000' }}>N/A</span>}</div>
                                    <div><strong>NEXT V:</strong> <span style={{ color: '#C80000', fontWeight: 'bold' }}>{visitData?.nextVisit ? new Date(visitData.nextVisit).toLocaleDateString('en-GB') : <span style={{ color: '#FF0000' }}>N/A</span>}</span></div>
                                </div>
                            </div>

                            <div style={{ flex: 1.3, position: 'relative', padding: '10px 8px 6px 8px' }}>
                                {renderPatientCopyLabel('Patient Info')}
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <div style={{ flex: 1, fontSize: '10px', lineHeight: 1.1 }}>
                                        <div><strong>OPDN:</strong> <span style={{ color: '#0000FF', fontWeight: 700 }}>{visitData?.opdNo || <span style={{ color: '#FF0000' }}>N/A</span>}</span></div>
                                        <div><strong>FULL NAME:</strong> <span style={{ color: '#0000FF', fontWeight: 700 }}>{patientName || <span style={{ color: '#FF0000' }}>N/A</span>}</span></div>
                                        <div><strong>F/H/G NAME:</strong> {visitData?.patient?.fatherHusbandGuardianName || <span style={{ color: '#FF0000' }}>N/A</span>}</div>
                                        <div><strong>ADDRESS:</strong> {visitData?.patient?.address || <span style={{ color: '#FF0000' }}>N/A</span>}</div>
                                        <div><strong>PHONE NO:</strong> {visitData?.patient?.phone || <span style={{ color: '#FF0000' }}>N/A</span>}</div>
                                        <div><strong>OCCUPATION:</strong> {visitData?.patient?.occupation || <span style={{ color: '#FF0000' }}>N/A</span>}</div>
                                    </div>
                                    <div style={{ width: '90px', height: '110px', border: '1px solid #d1d5db', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#ffffff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {visitData?.patient?.imageUrl ? (
                                            <img src={visitData.patient.imageUrl} alt="Patient" className="h-full w-full object-cover" />
                                        ) : (
                                            <div style={{ color: '#9ca3af', fontSize: '11px' }}>Photo</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {renderPatientCopyLabel('EH Parameters')}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px', marginBottom: '15px', fontSize: '10px' }}>
                            <div><strong>TEMP:</strong> {visitData?.temperament || <span style={{ color: '#FF0000' }}>N/A</span>}</div>
                            <div><strong>PULSE-1:</strong> {visitData?.pulseDiagnosis || <span style={{ color: '#FF0000' }}>N/A</span>}</div>
                            <div><strong>PULSE-2:</strong> {visitData?.pulseDiagnosis2 || <span style={{ color: '#FF0000' }}>N/A</span>}</div>
                        </div>

                        {renderPatientCopyLabel('Prev Info')}
                        <div style={{ marginBottom: '15px', fontSize: '9px' }}><strong>HISTORY & REPORTS:</strong> <span style={{ color: visitData?.historyReports ? '#0000FF' : '#FF0000', fontStyle: 'italic', fontFamily: 'Brush Script MT, cursive', fontSize: '12px' }}>{visitData?.historyReports || 'N/A'}</span></div>

                        {renderPatientCopyLabel('Sign & Symptoms')}
                        <div style={{ marginBottom: '15px', fontSize: '9px' }}><strong>CHIEF COMPLAINTS:</strong> <span style={{ color: visitData?.majorComplaints ? '#0000FF' : '#FF0000', fontStyle: 'italic', fontFamily: 'Brush Script MT, cursive', fontSize: '12px' }}>{visitData?.majorComplaints || 'N/A'}</span></div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', marginBottom: '15px' }}>
                            <div>
                                {renderPatientCopyLabel('Investigations')}
                                <div style={{ fontSize: '12px', color: visitData?.investigations ? '#0000FF' : '#FF0000', fontStyle: 'italic', fontFamily: 'Brush Script MT, cursive' }}>{visitData?.investigations || 'N/A'}</div>
                            </div>
                            <div>
                                {renderPatientCopyLabel('Provisional Diagnosis')}
                                <div style={{ fontSize: '12px', color: visitData?.provisionalDiagnosis ? '#0000FF' : '#FF0000', fontStyle: 'italic', fontFamily: 'Brush Script MT, cursive' }}>{visitData?.provisionalDiagnosis || 'N/A'}</div>
                            </div>
                        </div>

                        {renderPatientCopyLabel('Cure')}
                        <div style={{ marginBottom: '15px', fontSize: '9px' }}><strong>IMPROVEMENTS:</strong> <span style={{ color: visitData?.improvements ? '#0000FF' : '#FF0000', fontStyle: 'italic', fontFamily: 'Brush Script MT, cursive', fontSize: '12px' }}>{visitData?.improvements || 'N/A'}</span></div>

                        {renderPatientCopyLabel('Discuss')}
                        <div style={{ marginBottom: '15px', fontSize: '9px' }}><strong>DISCUSS:</strong> <span style={{ color: visitData?.discussion ? '#0000FF' : '#FF0000', fontStyle: 'italic', fontFamily: 'Brush Script MT, cursive', fontSize: '12px' }}>{visitData?.discussion || 'N/A'}</span></div>

                        <div style={{ borderBottom: `0.5px solid ${isPatientCopyProColor ? '#FF8C00' : '#111111'}`, marginBottom: '8px', marginLeft: '0.5rem', marginRight: '0.5rem' }} />

                        <div style={{ fontSize: '0.65rem' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <tbody>
                                    {(prescriptions || []).map((p: any, idx: number) => (
                                        <tr key={p.id || idx}>
                                            <td style={{ width: '3%', fontWeight: 700, padding: '0.1rem 0.2rem', textAlign: 'center' }}>{idx + 1}</td>
                                            <td style={{ width: '15%', fontWeight: 700, padding: '0.1rem 0.2rem' }}>{(p.product?.name || p.productName || '-').toUpperCase()}</td>
                                            <td style={{ width: '6%' }}></td>
                                            <td style={{ width: '6%' }}></td>
                                            <td style={{ width: '6%' }}></td>
                                            <td style={{ width: '8%', textAlign: 'center', padding: '0.1rem 0.2rem' }}>{(p.timing || '').replace(/\|/g, '/')}</td>
                                            <td style={{ width: '6%', textAlign: 'center', padding: '0.1rem 0.2rem' }}>{(p.dosage || '-').replace(/\|/g, '/')}</td>
                                            <td style={{ width: '6%' }}></td>
                                            <td style={{ width: '8%' }}></td>
                                            <td style={{ width: '6%', textAlign: 'center', padding: '0.1rem 0.2rem' }}>{(p.droppersToday?.toString() || '').toUpperCase()}</td>
                                        </tr>
                                    ))}
                                    {(!prescriptions || prescriptions.length === 0) ? (
                                        <tr>
                                            <td colSpan={10} style={{ padding: '4px 2px', color: '#9ca3af' }}>No medicines added.</td>
                                        </tr>
                                    ) : null}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div style={{ marginTop: 'auto', padding: '0 1.5rem', marginBottom: '1.5rem' }}>
                        {showSignature ? (
                            <div className={`mb-2 flex ${template.signaturePosition === 'left' ? 'justify-start' : template.signaturePosition === 'center' ? 'justify-center' : 'justify-end'}`}>
                                <div style={{ textAlign: 'center', minWidth: `${signatureWidth + 10}px` }}>
                                    <div className="mx-auto overflow-hidden border" style={{ backgroundColor: '#ffffff', width: `${signatureWidth}px`, height: `${signatureHeight}px` }}>
                                        {images.signature ? <img src={images.signature} alt="Signature" className="h-full w-full" style={imageTransformStyle(signatureBlock)} /> : null}
                                    </div>
                                    <div style={{ fontSize: '10px', marginTop: '2px', borderTop: '1px solid #111111', fontWeight: 700 }}>Doctor's Signature</div>
                                </div>
                            </div>
                        ) : null}

                        {showFooter ? (
                            images.footer ? (
                                <div className="w-full overflow-hidden border rounded" style={{ backgroundColor: '#ffffff', height: `${footerHeight}px` }}>
                                    <img src={images.footer} alt="Footer" className="h-full w-full" style={imageTransformStyle(footerBlock)} />
                                </div>
                            ) : (
                                <div className="w-full h-[90px] border rounded flex items-center justify-center text-gray-400">Footer</div>
                            )
                        ) : null}
                    </div>
                </div>
            ) : null}

            {!isPatientCopyCurrent ? (
                <div className="relative flex flex-col" style={{ zIndex: 1, minHeight: 'calc(1123px - 40px)', fontSize: fontSizeMap[template.fontSize] }}>
                    <section className="shrink-0" style={{ marginBottom: sectionGap(template.sectionHeights.header) }}>
                        {showHeader ? (
                            images.header ? (
                                <div className="w-full border rounded overflow-hidden" style={{ backgroundColor: '#ffffff', height: `${headerHeight}px` }}>
                                    <img src={images.header} alt="Header" className="block h-full w-full" style={imageTransformStyle(headerBlock)} />
                                </div>
                            ) : (
                                <div className="w-full h-[110px] border rounded flex items-center justify-center text-gray-400">Header</div>
                            )
                        ) : (
                            <div className="w-full" style={{ height: '110px' }} />
                        )}
                    </section>

                    <section className="min-h-0 flex-1">
                        <div className="flex h-full flex-col justify-center gap-2">
                            {middleSections.map((section) => renderMiddleSection(section.id))}
                        </div>
                    </section>

                    <section className="shrink-0" style={{ marginTop: sectionGap(template.sectionHeights.signature) }}>
                        {showSignature ? (
                            <div className={`mb-2 flex ${template.signaturePosition === 'left' ? 'justify-start' : template.signaturePosition === 'center' ? 'justify-center' : 'justify-end'}`}>
                                <div className="text-center">
                                    <div className="border overflow-hidden mx-auto" style={{ backgroundColor: '#ffffff', width: `${signatureWidth}px`, height: `${signatureHeight}px` }}>
                                        {images.signature ? (
                                            <img src={images.signature} alt="Signature" className="w-full h-full" style={imageTransformStyle(signatureBlock)} />
                                        ) : null}
                                    </div>
                                    <div className="text-[11px] mt-1 border-t">Doctor Signature</div>
                                </div>
                            </div>
                        ) : null}

                        {showFooter ? (
                            images.footer ? (
                                <div className="w-full border rounded overflow-hidden" style={{ backgroundColor: '#ffffff', height: `${footerHeight}px` }}>
                                    <img src={images.footer} alt="Footer" className="w-full h-full" style={imageTransformStyle(footerBlock)} />
                                </div>
                            ) : (
                                <div className="w-full h-[90px] border rounded flex items-center justify-center text-gray-400">Footer</div>
                            )
                        ) : null}
                    </section>
                </div>
            ) : null}
        </A4Page>
    )
}
