import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/router'
import { createWorker } from 'tesseract.js'
import { isBasicPlan } from '../lib/subscription'

interface ExtractedData {
    fullName?: string
    fatherHusbandGuardianName?: string
    dob?: string
    age?: number
    gender?: string
    address?: string
    photo?: string
}

interface AadhaarScanModalProps {
    isOpen: boolean
    onClose: () => void
    onAutofill: (data: ExtractedData) => void
    user?: any
}

type Step = 'select-mode' | 'scan-front' | 'scan-back' | 'upload-front' | 'upload-back' | 'review'
type Mode = 'scan' | 'upload' | null
type OcrModel = 'tesseract' | 'vision'

export default function AadhaarScanModal({ isOpen, onClose, onAutofill, user }: AadhaarScanModalProps) {
    const router = useRouter()
    const [step, setStep] = useState<Step>('select-mode')
    const [mode, setMode] = useState<Mode>(null)
    const [processing, setProcessing] = useState(false)
    const [frontData, setFrontData] = useState<ExtractedData | null>(null)
    const [backData, setBackData] = useState<ExtractedData | null>(null)
    const [stream, setStream] = useState<MediaStream | null>(null)
    const [ocrModel, setOcrModel] = useState<OcrModel>('tesseract')

    const plan: string = user?.clinic?.subscriptionPlan || 'standard'
    const hasVisionAccess = !isBasicPlan(plan)
    
    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const uploadInputRef = useRef<HTMLInputElement>(null)

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setStep('select-mode')
            setMode(null)
            setProcessing(false)
            setFrontData(null)
            setBackData(null)
            setOcrModel('tesseract')
            stopCamera()
        }
    }, [isOpen])

    // Reconnect stream to video element when step changes (for scan mode)
    useEffect(() => {
        if (stream && videoRef.current && (step === 'scan-front' || step === 'scan-back')) {
            videoRef.current.srcObject = stream
            // Ensure video plays after reconnection
            videoRef.current.play().catch(() => {})
        }
    }, [step, stream])

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop())
            setStream(null)
        }
    }

    const startCamera = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    aspectRatio: { ideal: 16/9 }
                }
            })
            setStream(mediaStream)
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream
                
                // Wait for metadata to load and ensure video plays on mobile
                await new Promise<void>((resolve) => {
                    if (videoRef.current) {
                        videoRef.current.onloadedmetadata = () => {
                            if (videoRef.current) {
                                videoRef.current.play().then(() => {
                                    resolve()
                                }).catch((err) => {
                                    resolve()
                                })
                            }
                        }
                    }
                })
            }
        } catch (error) {
            alert('Unable to access camera. Please check permissions.')
        }
    }

    const handleModeSelect = async (selectedMode: 'scan' | 'upload') => {
        if (isBasicPlan(plan)) {
            router.push('/upgrade')
            onClose()
            return
        }
        setMode(selectedMode)
        if (selectedMode === 'scan') {
            setStep('scan-front')
            await startCamera()
        } else {
            setStep('upload-front')
        }
    }

    const captureImage = (): string | null => {
        if (!videoRef.current || !canvasRef.current) return null

        const video = videoRef.current
        const canvas = canvasRef.current
        const context = canvas.getContext('2d')

        if (!context) return null

        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        context.drawImage(video, 0, 0)

        return canvas.toDataURL('image/jpeg', 0.95)
    }

    const extractPhotoFromAadhaar = async (imageData: string): Promise<string | null> => {
        try {
            return new Promise<string | null>((resolve) => {
                const img = new Image()
                img.src = imageData
                
                img.onload = () => {
                    try {
                        // Create canvas for cropping photo area (typically right side of front)
                        const canvas = document.createElement('canvas')
                        const ctx = canvas.getContext('2d')
                        if (!ctx) {
                            resolve(null)
                            return
                        }

                        const width = img.width
                        const height = img.height
                        
                        // Aadhaar photo is on the LEFT side of the card, not right!
                        // Standard Aadhaar card: photo starts at ~3-5% from left edge
                        // Photo dimensions: approximately 3.5cm x 4.5cm on 8.5cm x 5.4cm card
                        const photoWidth = Math.floor(width * 0.30)    // 30% of card width
                        const photoHeight = Math.floor(height * 0.65)  // 65% of card height  
                        const photoX = Math.floor(width * 0.04)        // Starts at 4% from left (LEFT SIDE!)
                        const photoY = Math.floor(height * 0.16)       // Starts at 16% from top
                        
                        canvas.width = photoWidth
                        canvas.height = photoHeight
                        
                        // Draw cropped photo region
                        ctx.drawImage(
                            img,
                            photoX, photoY, photoWidth, photoHeight,
                            0, 0, photoWidth, photoHeight
                        )
                        
                        const photoDataUrl = canvas.toDataURL('image/jpeg', 0.9)
                        resolve(photoDataUrl)
                    } catch (error) {
                        resolve(null)
                    }
                }
                
                img.onerror = () => {
                    resolve(null)
                }
            })
        } catch (error) {
            return null
        }
    }

    const processAadhaarImage = async (imageData: string, side: 'front' | 'back') => {
        setProcessing(true)

        try {
            // Vision OCR path: call server-side API
            if (ocrModel === 'vision') {
                const resp = await fetch('/api/aadhaar-ocr', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imageData, side })
                })
                if (!resp.ok) {
                    const err = await resp.json().catch(() => ({}))
                    throw new Error(err.error || `Vision OCR failed (${resp.status})`)
                }
                const { data } = await resp.json()
                const extractedData: ExtractedData = { ...data }

                // Extract photo from front side (still done client-side)
                if (side === 'front') {
                    const photo = await extractPhotoFromAadhaar(imageData)
                    if (photo) extractedData.photo = photo
                }

                if (side === 'front') {
                    setFrontData(extractedData)
                } else {
                    setBackData(extractedData)
                }

                if (side === 'front') {
                    setStep(mode === 'scan' ? 'scan-back' : 'upload-back')
                    if (mode !== 'scan' && uploadInputRef.current) uploadInputRef.current.value = ''
                } else {
                    setStep('review')
                    stopCamera()
                }
                return
            }

            // Tesseract OCR path (client-side)
            const worker = await createWorker('eng')
            const { data: { text } } = await worker.recognize(imageData)
            await worker.terminate()

            const extractedData: ExtractedData = {}

            // Clean and prepare text with aggressive cleanup
            const cleanText = text
                .replace(/[|\\]/g, 'I') // Replace pipes and backslashes with I
                .replace(/[０-９]/g, (m) => String.fromCharCode(m.charCodeAt(0) - 0xFEE0)) // Convert fullwidth to ASCII
                .replace(/[^\x00-\x7F]+/g, ' ') // Remove non-ASCII characters (Hindi text causes issues)
                .replace(/\s+/g, ' ') // Normalize spaces
            
            const lines = cleanText.split('\n').map(line => line.trim()).filter(line => line.length > 0)

            if (side === 'front') {
                // Extract DOB - Look for date patterns near "DOB" or "Birth" keywords
                let dobFound = false
                const dobKeywords = ['DOB', 'D.O.B', 'Date of Birth', 'Birth', 'जन्म']
                
                for (let i = 0; i < lines.length && !dobFound; i++) {
                    const line = lines[i]
                    const lineUpper = line.toUpperCase()
                    
                    // Check if line contains DOB keyword
                    const hasDobKeyword = dobKeywords.some(kw => lineUpper.includes(kw.toUpperCase()))
                    
                    // Look for date pattern in this line or next 2 lines if keyword found
                    const linesToCheck = hasDobKeyword ? [line, lines[i + 1], lines[i + 2]] : [line]
                    
                    for (const checkLine of linesToCheck) {
                        if (!checkLine) continue
                        
                        // Match DD/MM/YYYY or DD-MM-YYYY formats
                        const dateMatch = checkLine.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b/)
                        if (dateMatch) {
                            const day = dateMatch[1].padStart(2, '0')
                            const month = dateMatch[2].padStart(2, '0')
                            const year = dateMatch[3]
                            
                            // Validate date
                            const dayNum = parseInt(day)
                            const monthNum = parseInt(month)
                            const yearNum = parseInt(year)
                            
                            if (dayNum >= 1 && dayNum <= 31 && 
                                monthNum >= 1 && monthNum <= 12 && 
                                yearNum >= 1900 && yearNum <= new Date().getFullYear()) {
                                
                                const dobDate = `${year}-${month}-${day}`
                                extractedData.dob = dobDate
                                const birthDate = new Date(dobDate)
                                const today = new Date()
                                let age = today.getFullYear() - birthDate.getFullYear()
                                const monthDiff = today.getMonth() - birthDate.getMonth()
                                if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                                    age--
                                }
                                extractedData.age = age
                                dobFound = true
                                break
                            }
                        }
                    }
                }

                // Extract Gender - Look near "Gender" or "Sex" keywords
                let genderFound = false
                const genderKeywords = ['Gender', 'Sex', 'लिंग']
                
                for (let i = 0; i < lines.length && !genderFound; i++) {
                    const line = lines[i]
                    const lineUpper = line.toUpperCase()
                    
                    // Check current line and next line
                    const checkLines = [line, lines[i + 1]].filter(Boolean)
                    
                    for (const checkLine of checkLines) {
                        const upper = checkLine.toUpperCase()
                        if (upper.includes('MALE') && !upper.includes('FEMALE')) {
                            extractedData.gender = 'Male'
                            genderFound = true
                            break
                        } else if (upper.includes('FEMALE')) {
                            extractedData.gender = 'Female'
                            genderFound = true
                            break
                        } else if (checkLine.includes('पुरुष')) {
                            extractedData.gender = 'Male'
                            genderFound = true
                            break
                        } else if (checkLine.includes('महिला')) {
                            extractedData.gender = 'Female'
                            genderFound = true
                            break
                        }
                    }
                }

                // Extract Name - Look for name on Aadhaar
                let nameFound = false
                
                // Method 1: Look for name pattern in text
                // Pattern: Capitalized words (2-3 words) that appear before DOB or after Authority/India
                const namePattern = /\b([A-Z][a-z]{2,14}\s+[A-Z][a-z]{2,14}(?:\s+[A-Z][a-z]{2,14})?)\b/g
                const fullText = lines.join(' ')
                const potentialNames: string[] = []
                
                let match
                while ((match = namePattern.exec(fullText)) !== null) {
                    const name = match[1]
                    // Skip common non-name words
                    if (!name.match(/Government|Authority|India|Unique|Identification|Address|Male|Female|Aadhaar|House|Road|City|State|District|Punjab|Haryana/i)) {
                        potentialNames.push(name)
                    }
                }
                
                // Choose the first valid name (usually the actual person's name)
                if (potentialNames.length > 0) {
                    // Prefer names that are before "DOB" or "Male/Female" in the text
                    for (const name of potentialNames) {
                        const nameIndex = fullText.indexOf(name)
                        const dobIndex = fullText.indexOf('DOB')
                        const genderIndex = Math.max(fullText.indexOf('Male'), fullText.indexOf('Female'))
                        
                        // Skip if this name appears after S/O
                        const soIndex = fullText.indexOf('S/O')
                        if (soIndex > 0 && nameIndex > soIndex && nameIndex < soIndex + 50) {
                            continue
                        }
                        
                        // Name should come before DOB or Gender in the text
                        if ((dobIndex > 0 && nameIndex < dobIndex) || 
                            (genderIndex > 0 && nameIndex < genderIndex)) {
                            extractedData.fullName = name.toUpperCase()
                            nameFound = true
                            break
                        }
                    }
                    
                    // Fallback: use the first potential name that's not after S/O
                    if (!nameFound && potentialNames.length > 0) {
                        extractedData.fullName = potentialNames[0].toUpperCase()
                        nameFound = true
                    }
                }
            } else {
                // BACK SIDE - Extract Guardian Name and Address
                
                // Extract Father/Husband/Guardian Name - collect ALL S/O matches
                let guardianName = ''
                let guardianFound = false
                const allGuardianMatches: string[] = []
                
                // Look through all lines for S/O pattern - collect ALL matches
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i]
                    const lineUpper = line.toUpperCase()
                    
                    // Look for S/O, D/O, C/O, W/O patterns (case insensitive, flexible spacing)
                    if (lineUpper.includes('S/O') || lineUpper.includes('D/O') || 
                        lineUpper.includes('C/O') || lineUpper.includes('W/O')) {
                        
                        // Find ALL occurrences of S/O, D/O, C/O, W/O in the line
                        const patterns = [
                            { prefix: 'S/O', length: 3 },
                            { prefix: 'D/O', length: 3 },
                            { prefix: 'C/O', length: 3 },
                            { prefix: 'W/O', length: 3 }
                        ]
                        
                        for (const pattern of patterns) {
                            let searchIndex = 0
                            
                            // Find ALL occurrences of this pattern in the line
                            while (true) {
                                const foundIndex = lineUpper.indexOf(pattern.prefix, searchIndex)
                                if (foundIndex === -1) break
                                
                                // Extract text after this occurrence
                                let afterSO = line.substring(foundIndex + pattern.length).trim()
                                
                                // Clean up the text after S/O
                                afterSO = afterSO
                                    .replace(/^[,:\s-]+/, '') // Remove leading punctuation
                                    .replace(/,.*/g, '') // Remove everything after comma
                                    .replace(/HOUSE.*/gi, '') // Remove from HOUSE onwards
                                    .replace(/H\.?NO.*/gi, '') // Remove from H.NO onwards
                                    .replace(/ROAD.*/gi, '') // Remove from ROAD onwards
                                    .replace(/VILLAGE.*/gi, '')
                                    .replace(/DIST.*/gi, '')
                                    .replace(/POST.*/gi, '')
                                    .replace(/PO:.*/gi, '')
                                    .replace(/usti.*/gi, '') // Remove place names that come after
                                    .replace(/Deoria.*/gi, '')
                                    .replace(/Muzaffarpur.*/gi, '')
                                    .trim()
                                
                                // Extract valid name words (alphabetic only, 2+ chars)
                                const nameWords = afterSO.split(/\s+/)
                                    .filter(w => w.match(/^[A-Za-z]{2,}$/))
                                    .slice(0, 3) // Take max 3 words
                                
                                if (nameWords.length >= 1) {
                                    const extractedName = nameWords.join(' ')
                                    // Only accept if name is at least 5 characters (skip garbled OCR like "Ww FA")
                                    if (extractedName.length >= 5) {
                                        allGuardianMatches.push(extractedName)
                                    }
                                }
                                
                                // Move search position forward to find next occurrence
                                searchIndex = foundIndex + pattern.length
                            }
                        }
                    }
                }
                
                // Choose the longest/most valid guardian name (usually the English one)
                if (allGuardianMatches.length > 0) {
                    // Sort by length and take the longest one (likely the English translation)
                    guardianName = allGuardianMatches.sort((a, b) => b.length - a.length)[0]
                    guardianFound = true
                }

                // Store guardian name if found
                if (guardianFound && guardianName) {
                    extractedData.fatherHusbandGuardianName = guardianName.toUpperCase()
                }

                // Extract Address - Parse the structured address from back of card
                let addressFound = false
                const addressFullText = lines.join(' ')
                
                // Look for "Address:" keyword and extract everything after it
                const addressPattern = /Address[:\s]+(.+?)(?=help@uidai|www\.uidai|\d{4}\s+[A-Z]{2}\s+help|$)/i
                const addressMatch = addressFullText.match(addressPattern)
                
                if (addressMatch) {
                    let addressText = addressMatch[1].trim()
                    
                    // Store the guardian name to filter it out later
                    const guardianWords = guardianName ? guardianName.split(/\s+/).map(w => w.toLowerCase()) : []
                    
                    // VERY AGGRESSIVE guardian name removal
                    // Remove from S/O up to 30 characters or until we hit a known city/location marker
                    addressText = addressText.replace(/S\/O[^,]{0,50}?,/gi, '')
                    addressText = addressText.replace(/D\/O[^,]{0,50}?,/gi, '')
                    addressText = addressText.replace(/C\/O[^,]{0,50}?,/gi, '')
                    addressText = addressText.replace(/W\/O[^,]{0,50}?,/gi, '')
                    
                    // Also remove standalone S/O with surrounding text
                    addressText = addressText.replace(/S\/O\s+[A-Za-z\s]+/gi, '')
                    addressText = addressText.replace(/D\/O\s+[A-Za-z\s]+/gi, '')
                    
                    // Remove common garbage OCR patterns
                    addressText = addressText.replace(/\b(WIEN|Tair|HSTFHIYR|usti|fam)\b/gi, '')
                    addressText = addressText.replace(/\s+/g, ' ').trim()
                    
                    // Clean up the address
                    const addressComponents: string[] = []
                    
                    // Extract house/building number - be more specific
                    // Pattern: HOUSE NO.B-1, H.NO.123, HOUSE NUMBER B-1, NO.B-1, etc.
                    // Match variations: HOUSE NO.B-1, H.NO.B-1, NO.B-1, HOUSE NUMBER B-1
                    const housePattern = /(?:HOUSE\s*)?(?:H\.?|NO\.?)\s*(?:NO\.?|NUMBER)?\s*[A-Z]?[\-\.\/]?\d+(?:[A-Z\-\/\.]\d+)?/gi
                    const houseMatches = addressText.match(housePattern)
                    if (houseMatches && houseMatches.length > 0) {
                        // Take the most complete match (usually the first one)
                        let bestMatch = houseMatches[0]
                        // If we have "NO.B-1", prefer "HOUSE NO.B-1" if it exists
                        for (const match of houseMatches) {
                            if (match.toUpperCase().includes('HOUSE') && match.includes('NO')) {
                                bestMatch = match
                                break
                            }
                        }
                        const cleanHouse = bestMatch.trim().replace(/\s+/g, ' ').toUpperCase()
                        addressComponents.push(cleanHouse)
                    }
                    
                    // Extract road/street names - be more specific
                    const roadPattern = /\b([A-Z][A-Z\s]{2,20})\s+(?:ROAD|STREET|ST|LANE|MARG|PATH|GALI)\b/gi
                    const roadMatches = addressText.match(roadPattern)
                    if (roadMatches && roadMatches.length > 0) {
                        roadMatches.forEach(road => {
                            const cleanRoad = road.trim().replace(/\s+/g, ' ')
                            // Avoid garbage matches
                            if (cleanRoad.length > 5 && !cleanRoad.match(/^[A-Z]\s/)) {
                                addressComponents.push(cleanRoad)
                            }
                        })
                    }
                    
                    // Extract locality/area names (like ROYAL CITY)
                    // Look for uppercase multi-word patterns that are likely locality names
                    const localityPattern = /\b([A-Z]{2,}\s+[A-Z]{2,}(?:\s+[A-Z]{2,})?)\b/g
                    const localityMatches = addressText.match(localityPattern)
                    if (localityMatches) {
                        localityMatches.forEach(locality => {
                            const cleanLocality = locality.trim()
                            // Filter out common non-locality uppercase words
                            if (
                                cleanLocality.length >= 8 && 
                                cleanLocality.length <= 30 &&
                                !cleanLocality.match(/HOUSE|ROAD|STREET|ADDRESS|UNIQUE|IDENTIFICATION|AUTHORITY|INDIA|DIST|HELP|WWW/) &&
                                cleanLocality.split(/\s+/).length >= 2
                            ) {
                                addressComponents.push(cleanLocality)
                            }
                        })
                    }
                    
                    // DIRECT extraction: Look for known major Indian cities explicitly
                    const knownCities = ['Deoria', 'Muzaffarpur', 'Patna', 'Faridkot', 'Delhi', 'Mumbai', 'Kolkata', 'Chennai', 'Bangalore', 'Hyderabad', 'Pune', 'Ahmedabad', 'Jaipur', 'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Bhopal', 'Ludhiana', 'Agra', 'Varanasi', 'Ranchi', 'Guwahati']
                    for (const city of knownCities) {
                        const cityRegex = new RegExp(`\\b${city}\\b`, 'i')
                        if (cityRegex.test(addressText) && !addressComponents.some(comp => comp.toLowerCase() === city.toLowerCase())) {
                            addressComponents.push(city)
                        }
                    }
                    
                    // Extract city/district/village names (proper case, single or multi-word)
                    // Only look for cities that appear in structured patterns before state/PIN
                    const parts = addressText.split(',')
                    const stateIndex = addressText.search(/\b(Bihar|Punjab|Haryana|Delhi|Rajasthan)/i)
                    const pinIndex = addressText.search(/\d{6}/)
                    const searchLimit = Math.min(
                        stateIndex > 0 ? stateIndex : addressText.length,
                        pinIndex > 0 ? pinIndex : addressText.length
                    )
                    const relevantText = addressText.substring(0, searchLimit)
                    
                    for (const part of parts) {
                        const trimmed = part.trim()
                        // Skip if this part is after state/PIN (likely garbage)
                        if (addressText.indexOf(trimmed) > searchLimit) {
                            continue
                        }
                        
                        // Look for patterns like "Deoria" or "Muzaffarpur" or "PO:Faridkot" or "DIST:Faridkot"
                        const cityPattern = /(?:PO|DIST|POST)?[:\s]*([A-Z][a-z]{4,15})/g
                        let cityMatch
                        while ((cityMatch = cityPattern.exec(trimmed)) !== null) {
                            const city = cityMatch[1].trim()
                            const cityLower = city.toLowerCase()
                            
                            // Very strict validation for real place names
                            if (
                                city.length >= 5 &&
                                city.length <= 15 &&
                                !city.match(/Address|House|Road|Street|Unique|Identification|Authority|India|City|Royal|Number|Dist|Post|Tear|Lith|Help|Tair|Nique|Kumar|Ramesh|Wien/) &&
                                // Exclude guardian name words
                                !guardianWords.includes(cityLower) &&
                                !addressComponents.some(comp => comp.toLowerCase().includes(cityLower)) &&
                                // Must be in the relevant text before state/PIN
                                relevantText.includes(city) &&
                                // Must match known Indian cities/districts OR be multi-word locality
                                (city.match(/Deoria|Muzaffarpur|Patna|Delhi|Mumbai|Kolkata|Chennai|Bangalore|Hyderabad|Pune|Ahmedabad|Jaipur|Lucknow|Kanpur|Nagpur|Indore|Bhopal|Ludhiana|Agra|Meerut|Varanasi|Faridkot|Fania|Raipur|Guwahati|Bhubaneswar|Chandigarh|Ranchi/i) || trimmed.includes(' '))
                            ) {
                                addressComponents.push(city)
                            }
                        }
                    }
                    
                    // Extract state
                    const stateMatch = addressText.match(/\b(Bihar|Punjab|Haryana|Delhi|Rajasthan|UP|Uttar Pradesh|Maharashtra|Gujarat|Karnataka|Tamil Nadu|Kerala|West Bengal|Odisha|Assam|Uttarakhand|HP|Himachal Pradesh|Madhya Pradesh|MP|Jharkhand|Chhattisgarh|Andhra Pradesh|Telangana|Goa)\b/i)
                    if (stateMatch) {
                        addressComponents.push(stateMatch[1])
                    }
                    
                    // Extract PIN code
                    const pinMatch = addressText.match(/\b(\d{6})\b/)
                    if (pinMatch) {
                        addressComponents.push(pinMatch[1])
                    }
                    
                    // Build final address
                    if (addressComponents.length >= 2) {
                        // Remove duplicates while preserving order
                        const uniqueComponents: string[] = []
                        addressComponents.forEach(comp => {
                            if (!uniqueComponents.some(existing => 
                                existing.toLowerCase().includes(comp.toLowerCase()) || 
                                comp.toLowerCase().includes(existing.toLowerCase())
                            )) {
                                uniqueComponents.push(comp)
                            }
                        })
                        extractedData.address = uniqueComponents.join(', ').toUpperCase()
                        addressFound = true
                    }
                }
            }

            // Mask any Aadhaar numbers in all extracted data (for security)
            Object.keys(extractedData).forEach(key => {
                if (typeof extractedData[key as keyof ExtractedData] === 'string') {
                    const value = extractedData[key as keyof ExtractedData] as string
                    extractedData[key as keyof ExtractedData] = value.replace(/\d{4}\s*\d{4}\s*\d{4}/g, 'XXXX XXXX XXXX') as any
                }
            })

            // Extract photo from front side of Aadhaar
            if (side === 'front') {
                const photo = await extractPhotoFromAadhaar(imageData)
                if (photo) {
                    extractedData.photo = photo
                }
            }

            if (side === 'front') {
                setFrontData(extractedData)
            } else {
                setBackData(extractedData)
            }

            // Move to next step
            if (side === 'front') {
                setStep(mode === 'scan' ? 'scan-back' : 'upload-back')
                if (mode === 'scan') {
                    // Keep camera running for back side
                } else {
                    // Reset upload input for back side
                    if (uploadInputRef.current) {
                        uploadInputRef.current.value = ''
                    }
                }
            } else {
                setStep('review')
                stopCamera()
            }

        } catch (error) {
            alert('Failed to process Aadhaar card. Please try again.')
        } finally {
            setProcessing(false)
        }
    }

    const handleCapture = async () => {
        const imageData = captureImage()
        if (!imageData) return

        const currentSide = step === 'scan-front' ? 'front' : 'back'
        await processAadhaarImage(imageData, currentSide)
    }

    const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = async (e) => {
            const imageData = e.target?.result as string
            const currentSide = step === 'upload-front' ? 'front' : 'back'
            await processAadhaarImage(imageData, currentSide)
        }
        reader.readAsDataURL(file)
    }

    const handleAutofill = () => {
        const combinedData: ExtractedData = {
            ...frontData,
            ...backData
        }
        onAutofill(combinedData)
        onClose()
    }

    const handleBack = () => {
        if (step === 'scan-front' || step === 'upload-front') {
            stopCamera()
            setStep('select-mode')
            setMode(null)
            setFrontData(null)
            setBackData(null)
        } else if (step === 'scan-back') {
            setStep('scan-front')
            setBackData(null)
        } else if (step === 'upload-back') {
            setStep('upload-front')
            setBackData(null)
        } else if (step === 'review') {
            setStep(mode === 'scan' ? 'scan-back' : 'upload-back')
            setBackData(null)
            if (mode === 'scan') {
                startCamera()
            }
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[10000] p-4 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="relative overflow-hidden bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border-2 border-blue-200/50 dark:border-blue-700/50 animate-in zoom-in duration-300">
                {/* Animated background gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none"></div>
                {/* Header */}
                <div className="relative bg-gradient-to-r from-blue-50 to-sky-50 dark:from-gray-800 dark:to-gray-800 px-6 py-4 border-b border-blue-200/50 dark:border-blue-700/50 flex items-center justify-between backdrop-blur-sm">
                    {step !== 'select-mode' && (
                        <button
                            onClick={handleBack}
                            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                            disabled={processing}
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                    )}
                    <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-blue-600 dark:from-sky-400 dark:to-blue-400 flex-1 text-center">
                        Aadhaar Card {step === 'select-mode' ? 'Scanner' : step.includes('front') ? '- Front Side' : step.includes('back') ? '- Back Side' : '- Review'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                        disabled={processing}
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-8">
                    {/* Step 1: Select Mode */}
                    {step === 'select-mode' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* OCR Model Selector */}
                            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-200 dark:border-indigo-700 rounded-xl p-4">
                                <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide mb-3">OCR Engine</p>
                                <div className="grid grid-cols-2 gap-3">
                                    {/* Tesseract option */}
                                    <button
                                        type="button"
                                        onClick={() => setOcrModel('tesseract')}
                                        className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                                            ocrModel === 'tesseract'
                                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                                                : 'border-gray-200 dark:border-gray-600 hover:border-blue-300'
                                        }`}
                                    >
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${ocrModel === 'tesseract' ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}`}>
                                            <svg className={`w-4 h-4 ${ocrModel === 'tesseract' ? 'text-white' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Tesseract</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Free · Local</p>
                                        </div>
                                    </button>

                                    {/* Vision OCR option */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!hasVisionAccess) {
                                                router.push('/upgrade')
                                                onClose()
                                                return
                                            }
                                            setOcrModel('vision')
                                        }}
                                        className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                                            hasVisionAccess
                                                ? ocrModel === 'vision'
                                                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30'
                                                    : 'border-gray-200 dark:border-gray-600 hover:border-purple-300'
                                                : 'border-gray-200 dark:border-gray-600 hover:border-amber-400 cursor-pointer'
                                        }`}
                                    >
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${ocrModel === 'vision' && hasVisionAccess ? 'bg-purple-500' : 'bg-gray-200 dark:bg-gray-700'}`}>
                                            <svg className={`w-4 h-4 ${ocrModel === 'vision' && hasVisionAccess ? 'text-white' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Vision + Gemini</p>
                                                {!hasVisionAccess && (
                                                    <span className="px-1.5 py-0.5 text-xs font-bold bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-full leading-none">AI OCR</span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">{hasVisionAccess ? 'High accuracy' : 'Tap to unlock'}</p>
                                        </div>
                                    </button>
                                </div>
                                {!hasVisionAccess && (
                                    <p className="mt-2.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-1.5">
                                        ✨ Vision + Gemini OCR gives dramatically better results. Available with <strong>AI OCR add-on</strong> (₹500/yr) or Pro plan.
                                    </p>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <button
                                onClick={() => handleModeSelect('scan')}
                                className="group relative p-8 border-2 border-blue-200 dark:border-blue-700 rounded-xl hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-2xl hover:shadow-blue-500/20 transition-all duration-300 hover:-translate-y-1 bg-gradient-to-br from-blue-50/50 to-sky-50/50 dark:from-gray-800/50 dark:to-gray-800/50"
                            >
                                <div className="flex flex-col items-center gap-4">
                                    <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-sky-200 dark:from-blue-900 dark:to-sky-800 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-lg shadow-blue-500/30">
                                        <svg className="w-10 h-10 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    </div>
                                    <div className="text-center">
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Scan with Camera</h3>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">Use your device camera to scan Aadhaar card</p>
                                    </div>
                                </div>
                            </button>

                            <button
                                onClick={() => handleModeSelect('upload')}
                                className="group relative p-8 border-2 border-blue-200 dark:border-blue-700 rounded-xl hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-2xl hover:shadow-blue-500/20 transition-all duration-300 hover:-translate-y-1 bg-gradient-to-br from-blue-50/50 to-sky-50/50 dark:from-gray-800/50 dark:to-gray-800/50"
                            >
                                <div className="flex flex-col items-center gap-4">
                                    <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-sky-200 dark:from-blue-900 dark:to-sky-800 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-lg shadow-blue-500/30">
                                        <svg className="w-10 h-10 text-sky-600 dark:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                        </svg>
                                    </div>
                                    <div className="text-center">
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Upload Image</h3>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">Upload Aadhaar card images from your device</p>
                                    </div>
                                </div>
                            </button>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Scan Front */}
                    {step === 'scan-front' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="relative bg-black rounded-lg overflow-hidden shadow-2xl shadow-blue-500/20 aspect-[4/3] sm:aspect-[16/9] max-h-[70vh]">
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="w-full h-full object-cover"
                                />
                                {/* Aadhaar Card Overlay Guide */}
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="relative w-[85%] max-w-[400px] aspect-[1.586] border-4 border-blue-500 rounded-lg animate-pulse" style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.6), 0 0 20px rgba(59,130,246, 0.5)' }}>
                                        <div className="absolute -top-8 sm:-top-10 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-blue-500 to-sky-500 text-white px-3 py-1 sm:px-4 rounded-full text-xs sm:text-sm font-medium shadow-lg whitespace-nowrap">
                                            Position Front Side Here
                                        </div>
                                    </div>
                                </div>
                                <canvas ref={canvasRef} className="hidden" />
                            </div>
                            <button
                                onClick={handleCapture}
                                disabled={processing}
                                className="w-full py-3 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white font-semibold rounded-lg transition-all shadow-lg hover:shadow-xl hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {processing ? (
                                    <>
                                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                                        <span>Processing...</span>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        <span>Capture Front Side</span>
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Step 3: Scan Back */}
                    {step === 'scan-back' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {frontData && (
                                <div className="bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4 mb-4 animate-in slide-in-from-top-2 duration-300">
                                    <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2 text-sm sm:text-base">
                                        <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        Front Side Captured Successfully
                                    </h4>
                                    <div className="text-xs sm:text-sm text-blue-700 dark:text-blue-400 space-y-1">
                                        {frontData.fullName && <p>Name: {frontData.fullName}</p>}
                                        {frontData.dob && <p>DOB: {frontData.dob}</p>}
                                        {frontData.gender && <p>Gender: {frontData.gender}</p>}
                                    </div>
                                </div>
                            )}
                            <div className="relative bg-black rounded-lg overflow-hidden shadow-2xl shadow-blue-500/20 aspect-[4/3] sm:aspect-[16/9] max-h-[70vh]">
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="w-full h-full object-cover"
                                />
                                {/* Aadhaar Card Overlay Guide */}
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="relative w-[85%] max-w-[400px] aspect-[1.586] border-4 border-blue-500 rounded-lg animate-pulse" style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.6), 0 0 20px rgba(59,130,246, 0.5)' }}>
                                        <div className="absolute -top-8 sm:-top-10 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-blue-500 to-sky-500 text-white px-3 py-1 sm:px-4 rounded-full text-xs sm:text-sm font-medium shadow-lg whitespace-nowrap">
                                            Position Back Side Here
                                        </div>
                                    </div>
                                </div>
                                <canvas ref={canvasRef} className="hidden" />
                            </div>
                            <button
                                onClick={handleCapture}
                                disabled={processing}
                                className="w-full py-3 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white font-semibold rounded-lg transition-all shadow-lg hover:shadow-xl hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {processing ? (
                                    <>
                                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                                        <span>Processing...</span>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        <span>Capture Back Side</span>
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Step 4: Upload Front */}
                    {step === 'upload-front' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <label className="block">
                                <div className="border-2 border-dashed border-blue-300 dark:border-blue-600 rounded-lg p-12 text-center cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-all duration-300 hover:scale-105">
                                    <svg className="w-16 h-16 mx-auto mb-4 text-blue-500 dark:text-blue-400 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                    <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">Upload Front Side</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Click to select or drag and drop</p>
                                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">Supported: JPG, PNG, JPEG</p>
                                </div>
                                <input
                                    ref={uploadInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleUpload}
                                    disabled={processing}
                                    className="hidden"
                                />
                            </label>
                            {processing && (
                                <div className="text-center py-8 animate-in fade-in zoom-in duration-300">
                                    <div className="relative inline-block">
                                        <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 dark:border-t-blue-400"></div>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                    </div>
                                    <p className="mt-4 text-sm font-medium text-blue-600 dark:text-blue-400">Processing front side...</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Extracting information using AI</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 5: Upload Back */}
                    {step === 'upload-back' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {frontData && (
                                <div className="bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4 animate-in slide-in-from-top-2 duration-300">
                                    <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        Front Side Uploaded Successfully
                                    </h4>
                                    <div className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
                                        {frontData.fullName && <p>Name: {frontData.fullName}</p>}
                                        {frontData.dob && <p>DOB: {frontData.dob}</p>}
                                        {frontData.gender && <p>Gender: {frontData.gender}</p>}
                                    </div>
                                </div>
                            )}
                            <label className="block">
                                <div className="border-2 border-dashed border-blue-300 dark:border-blue-600 rounded-lg p-12 text-center cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-all duration-300 hover:scale-105">
                                    <svg className="w-16 h-16 mx-auto mb-4 text-blue-500 dark:text-blue-400 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                    <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">Upload Back Side</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Click to select or drag and drop</p>
                                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">Supported: JPG, PNG, JPEG</p>
                                </div>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleUpload}
                                    disabled={processing}
                                    className="hidden"
                                />
                            </label>
                            {processing && (
                                <div className="text-center py-8 animate-in fade-in zoom-in duration-300">
                                    <div className="relative inline-block">
                                        <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 dark:border-t-blue-400"></div>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                    </div>
                                    <p className="mt-4 text-sm font-medium text-blue-600 dark:text-blue-400">Processing back side...</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Extracting address and guardian information</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 6: Review & Autofill */}
                    {step === 'review' && (
                        <div className="space-y-6 animate-in fade-in zoom-in duration-500">
                            <div className="relative overflow-hidden bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-6 shadow-lg shadow-blue-500/10">
                                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none"></div>
                                <h3 className="relative text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400 mb-4 flex items-center gap-2">
                                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-sky-500 rounded-full flex items-center justify-center animate-pulse">
                                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    Extracted Information - Ready to Autofill
                                </h3>
                                
                                {/* Photo Preview */}
                                {frontData?.photo && (
                                    <div className="relative mb-6 flex justify-center">
                                        <div className="relative group">
                                            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-sky-600 rounded-lg blur opacity-75 group-hover:opacity-100 transition duration-300 animate-pulse"></div>
                                            <img 
                                                src={frontData.photo} 
                                                alt="Extracted Photo" 
                                                className="relative w-32 h-32 object-cover rounded-lg border-4 border-white dark:border-gray-800 shadow-xl"
                                            />
                                            <div className="absolute -bottom-2 -right-2 bg-blue-500 text-white rounded-full p-1.5 shadow-lg">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                
                                <div className="relative grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                    {frontData?.fullName && (
                                        <div className="bg-white/50 dark:bg-gray-800/50 p-3 rounded-lg backdrop-blur-sm border border-blue-200/50 dark:border-blue-700/50 hover:shadow-md transition-shadow">
                                            <span className="font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                </svg>
                                                Full Name:
                                            </span>
                                            <p className="text-gray-900 dark:text-gray-100 mt-1 font-medium">{frontData.fullName}</p>
                                        </div>
                                    )}
                                    {backData?.fatherHusbandGuardianName && (
                                        <div className="bg-white/50 dark:bg-gray-800/50 p-3 rounded-lg backdrop-blur-sm border border-blue-200/50 dark:border-blue-700/50 hover:shadow-md transition-shadow">
                                            <span className="font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                                </svg>
                                                Guardian Name:
                                            </span>
                                            <p className="text-gray-900 dark:text-gray-100 mt-1 font-medium">{backData.fatherHusbandGuardianName}</p>
                                        </div>
                                    )}
                                    {frontData?.dob && (
                                        <div className="bg-white/50 dark:bg-gray-800/50 p-3 rounded-lg backdrop-blur-sm border border-blue-200/50 dark:border-blue-700/50 hover:shadow-md transition-shadow">
                                            <span className="font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                                Date of Birth:
                                            </span>
                                            <p className="text-gray-900 dark:text-gray-100 mt-1 font-medium">{frontData.dob}</p>
                                        </div>
                                    )}
                                    {frontData?.age !== undefined && (
                                        <div className="bg-white/50 dark:bg-gray-800/50 p-3 rounded-lg backdrop-blur-sm border border-blue-200/50 dark:border-blue-700/50 hover:shadow-md transition-shadow">
                                            <span className="font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                Age:
                                            </span>
                                            <p className="text-gray-900 dark:text-gray-100 mt-1 font-medium">{frontData.age} years</p>
                                        </div>
                                    )}
                                    {frontData?.gender && (
                                        <div className="bg-white/50 dark:bg-gray-800/50 p-3 rounded-lg backdrop-blur-sm border border-blue-200/50 dark:border-blue-700/50 hover:shadow-md transition-shadow">
                                            <span className="font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                </svg>
                                                Gender:
                                            </span>
                                            <p className="text-gray-900 dark:text-gray-100 mt-1 font-medium">{frontData.gender}</p>
                                        </div>
                                    )}
                                    {backData?.address && (
                                        <div className="md:col-span-2 bg-white/50 dark:bg-gray-800/50 p-3 rounded-lg backdrop-blur-sm border border-blue-200/50 dark:border-blue-700/50 hover:shadow-md transition-shadow">
                                            <span className="font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                </svg>
                                                Address:
                                            </span>
                                            <p className="text-gray-900 dark:text-gray-100 mt-1 font-medium">{backData.address}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <button
                                onClick={handleAutofill}
                                className="group relative w-full py-4 bg-gradient-to-r from-blue-600 via-sky-600 to-blue-600 hover:from-blue-700 hover:via-sky-700 hover:to-blue-700 text-white font-bold text-lg rounded-xl transition-all duration-300 shadow-xl shadow-blue-500/30 hover:shadow-2xl hover:shadow-blue-500/50 hover:scale-105 overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 group-hover:translate-x-full transition-transform duration-1000"></div>
                                <span className="relative flex items-center justify-center gap-3">
                                    <svg className="w-6 h-6 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Autofill Patient Details
                                    <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                    </svg>
                                </span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}



