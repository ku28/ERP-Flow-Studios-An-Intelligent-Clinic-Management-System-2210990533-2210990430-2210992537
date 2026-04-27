import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats patient registration date into a 6-digit patient ID (YYMMDD).
 * @param patientDate - Registration date or creation date
 * @returns A 6-digit patient ID (e.g., "260319")
 */
export function formatPatientId(patientDate: Date | string | number | null | undefined): string {
  if (patientDate === null || patientDate === undefined || patientDate === '') return ''
  const date = patientDate instanceof Date ? patientDate : new Date(patientDate)
  if (Number.isNaN(date.getTime())) return ''

  const yy = date.getFullYear().toString().slice(-2)
  const mm = (date.getMonth() + 1).toString().padStart(2, '0')
  const dd = date.getDate().toString().padStart(2, '0')
  return `${yy}${mm}${dd}`
}

/**
 * Formats the unique patient ID as: YYMMDD NN
 * where NN is the per-day patient sequence/token number.
 */
export function formatPatientIdWithSequence(
  patientDate: Date | string | number | null | undefined,
  sequenceNumber: number | string | null | undefined
): string {
  const baseId = formatPatientId(patientDate)
  if (!baseId) return ''

  const seq = Number(sequenceNumber)
  if (!Number.isFinite(seq) || seq <= 0) return baseId

  return `${baseId} ${String(Math.trunc(seq)).padStart(2, '0')}`
}

/**
 * Generates an OPD Number in the format: PATIENT_ID VV
 * where PATIENT_ID is YYMMDD NN and VV is visit number.
 * @param patientDate - The patient registration/creation date (converted to YYMMDD)
 * @param patientSequenceNumber - The per-day patient sequence/token number
 * @param visitCount - The visit count for this patient (1-indexed)
 * @returns A formatted OPD number string (e.g., "260319 07 03")
 */
export function generateOpdNo(patientDate: Date | string | number, patientSequenceNumber: number, visitCount: number): string {
  const patientId = formatPatientIdWithSequence(patientDate, patientSequenceNumber)
  const visit = visitCount.toString().padStart(2, '0')
  return `${patientId} ${visit}`
}
/**
 * Format a number as a price with 2 decimal places
 * @param value - The numeric value to format
 * @returns Formatted string with 2 decimal places (e.g., "123.45")
 */
export function formatPrice(value: number | string | null | undefined): string {
  const num = Number(value)
  if (isNaN(num)) return '0.00'
  return num.toFixed(2)
}

/**
 * Format a quantity or non-price value with 1 decimal place
 * @param value - The numeric value to format
 * @returns Formatted string with 1 decimal place (e.g., "123.5")
 */
export function formatQuantity(value: number | string | null | undefined): string {
  const num = Number(value)
  if (isNaN(num)) return '0.0'
  return num.toFixed(1)
}

/**
 * Get clinic-specific Cloudinary folder path for multi-tenant isolation
 * @param clinicName - The clinic name (from user's clinic)
 * @param subfolder - The subfolder type (e.g., 'prescriptions', 'bills', 'patients')
 * @returns Formatted folder path (e.g., 'erp-flow-studios/ClinicName/prescriptions')
 */
export function getClinicCloudinaryFolder(clinicName: string, subfolder: string): string {
  // Sanitize clinic name for use in folder path
  const sanitizedName = clinicName.replace(/[^a-zA-Z0-9-_]/g, '_').replace(/_{2,}/g, '_')
  return `erp-flow-studios/${sanitizedName}/${subfolder}`
}

/**
 * Format a currency value with rupee symbol and 2 decimal places
 * @param value - The numeric value to format
 * @returns Formatted currency string (e.g., "₹123.45")
 */
export function formatCurrency(value: number | string | null | undefined): string {
  return `₹${formatPrice(value)}`
}