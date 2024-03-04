type HttpMethod = 'post' | 'put' | 'patch'

export interface UploadOptions {
    /** Whether the URL is presigned. */
    presigned?: boolean,
    /** Allow multiple files */
    multiple?: boolean
    /** The URL to upload the file to. */
    url?: string
    /** The method to use when uploading the file. */
    method?: HttpMethod
    /** Comma separated file of accepted file types. Wildcards accepted */
    accepts?: string
    /** Maximum number of files allowed if multiple enabled */
    fileLimit?: number
    /** Maximum file size allowed in bytes*/
    sizeLimit?: number
    /** Format size */
    formatSize?: Units
    /** Stop multi-file uploads if one errors */
    stopOnError?: boolean
    /** Eerror message for file limit exceed */
    fileLimitMessage?: string
    /** Error message for size limit exceed */
    sizeLimitMessage?: string
    /** Error message for invalid file type */
    typeMessage?: string
    /** Error message for if an error occurs */
    endpointMessage?: string
    /** Size of each chunk, must be multiple of 256 */
    chunkSize?: number
    immediate?: boolean
    headers?: object
}

export interface FileFormat {
    id: number;
    name: string;
    size: number
    type: string
    extension?: string
    formattedSize: ByteFormat
    raw: File
    data?: any
    
    upload: () => void
    pause?: () => void
    resume?: () => void
    cancel?: () => void
    progress: number
    completed: boolean
    processing: boolean
}

export interface ErrorMessages {
    fileLimit: string | null
    sizeLimit: string | null
    type: string | null
    endpoint: string | null
}

type ProcessWhen = 'immediate' | 'waited'
type UploadType = 'presigned' | 'chunked' | undefined

export interface UploaderType {
    when: ProcessWhen
    type?: UploadType
}