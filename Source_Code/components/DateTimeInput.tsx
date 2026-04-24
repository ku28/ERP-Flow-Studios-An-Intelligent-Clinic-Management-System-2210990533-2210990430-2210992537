import DateInput from './DateInput'

interface DateTimeInputProps {
    dateValue: string
    timeValue: string
    onDateChange: (e: React.ChangeEvent<HTMLInputElement>) => void
    onTimeChange: (e: React.ChangeEvent<HTMLInputElement>) => void
    datePlaceholder?: string
    timePlaceholder?: string
    required?: boolean
}

export default function DateTimeInput({
    dateValue,
    timeValue,
    onDateChange,
    onTimeChange,
    datePlaceholder = 'Select date',
    timePlaceholder = 'Select time',
    required = false
}: DateTimeInputProps) {
    return (
        <div className="grid grid-cols-2 gap-2">
            <div>
                <DateInput
                    type="date"
                    value={dateValue}
                    onChange={onDateChange}
                    placeholder={datePlaceholder}
                    required={required}
                    className="p-2 border rounded w-full"
                />
            </div>
            <div>
                <input
                    type="time"
                    value={timeValue}
                    onChange={onTimeChange}
                    required={required}
                    className="p-2 border rounded w-full"
                    placeholder={timePlaceholder}
                />
            </div>
        </div>
    )
}
