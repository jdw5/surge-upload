import { computed, onMounted, reactive, ref, type Ref } from 'vue';
import { formatBytes } from './utils';
import { createUpload } from '@mux/upchunk'
// @ts-ignore  
import type { AllowedMethod } from '@mux/upchunk'
import axios from 'axios';
import type { UploadOptions, FileFormat, ErrorMessages, UploaderType } from './types'

export const useUpload = (input: Ref<HTMLInputElement>, options: UploadOptions = {}) => {  
    const {
        immediate = false,
        url = null,
        chunkSize = null,
        presigned = false,
        multiple = false,
        method = 'post',
        accepts = null,
        fileLimit = null,
        sizeLimit = null,
        formatSize = undefined,
        stopOnError = false,
        fileLimitMessage = 'Maximum number of files exceeded, limit is {1}.',
        sizeLimitMessage = '{0}: Invalid file size, files must be smaller than {1}.',
        typeMessage = '{0}: Invalid file type, allowed file types: {1}.',
        endpointMessage = 'An error occurred while uploading the file.',
        headers = {}
    } = options
    
    /**
    * Ref containing the files
    */
    const files = ref<FileFormat[]>([])
    
    /**
    * Set the multiple attribute on the input if needed
    */
    if (multiple) input.value.setAttribute('multiple', 'true')
    
    /**
    * Computed value of the number of files
    */
    const count = computed(() => files.value.length)
    
    /**
    * Once computed value of the size limit
    */
    const formattedSizeLimit = sizeLimit !== null ? formatBytes(sizeLimit, formatSize) : { value: 0, unit: 'b'}
    
    /**
    * Computed value of the uploader type
    */
    const uploaderType = computed((): UploaderType => {
        if (immediate && !url) throw new Error('Immediate uploads require a URL passed as an option.')
        if (immediate && presigned) return { when: 'immediate', type: 'presigned' }
        if (immediate && chunkSize !== null) return { when: 'immediate', type: 'chunked' }
        if (immediate) return { when: 'immediate' }
        if (presigned) return { when: 'waited', type: 'presigned' }
        if (chunkSize !== null) return { when: 'waited', type: 'chunked' }
        return { when: 'waited' }
    })
    
    /** 
    * Internal state ID for unique keying
    */
    let id = ref(0)
    
    /**
    * Use the ID to generate a unique key
    * @returns id
    */
    const useId = () => id.value++
    
    /**
    * Error messages generated
    */
    const errors = reactive<ErrorMessages>({
        fileLimit: null,
        sizeLimit: null,
        type: null,
        endpoint: null,
    })
    
    /**
    * Clear all error messages
    */
    const clearErrors = () => Object.keys(errors).forEach((key) => errors[key] = null)
    
    /**
    * Format the file limit error message using the provided option
    * @param exceededTo 
    * @returns string
    */
    const formatFileLimitError = (exceededTo: number) => fileLimitMessage.replace('{0}', exceededTo.toString()).replace('{1}', multiple ? (fileLimit !== null ? fileLimit.toString() : '-') : '1' )
    const formatSizeLimitError = (name: string) => sizeLimitMessage.replace('{0}', name).replace('{1}', `${formattedSizeLimit.value}${formattedSizeLimit.unit}`)
    const formatTypeError = (name: string) => typeMessage.replace('{0}', name).replace('{1}', accepts === null ? '-' : accepts.split(',').join(', ')) // Trim the whitespace too    
    const formatEndpointError = (name: string, error: any) => endpointMessage.replace('{0}', name).replace('{1}', error) 
    
    /**
    * Validate the file size limit relative to the provided option, if one exists
    * @param file 
    * @returns 
    */
    const validateSizeLimit = (file: File): boolean => {
        if (sizeLimit === null) return true
        
        const valid = file.size <= sizeLimit
        if (!valid) {
            errors.sizeLimit = formatSizeLimitError(file.name)
        }
        return valid
    }
    
    /**
    * Validate the file limit relative to the provided option, if one exists
    * @param filelist 
    * @returns 
    */
    const validateFileLimit = (filelist?: FileList): boolean => {
        if (fileLimit === null) return true
        
        const numFiles = filelist ? filelist.length : 1
        const valid = numFiles + count.value <= fileLimit
        if (!valid) {
            errors.fileLimit = formatFileLimitError(numFiles)
        } 
        return valid
    }
    
    /**
    * Validate the file type relative to the provided option, if one exists
    * @param file 
    * @returns 
    */
    const validateType = (file: File): boolean => {
        if (accepts === null) return true
        
        const valid = accepts.split(',').some((type) => {
            if (type === '*') return true
            
            if (!type.includes('/')) {
                return file.name.endsWith(type)
            } 
            // Else check the MIME type and verify for wildcards
            try {
                const [typeGroup, subtype] = type.split('/')
                const [fileType, fileSubtype] = file.type.split('/')
                return (typeGroup === fileType || typeGroup === '*') && (subtype === fileSubtype || subtype === '*')
            }
            catch {
                return false
            }
        })
        
        if (!valid) {
            errors.type = formatTypeError(file.name)
        }
        return valid
    }
    
    /**
    * Check if there are any errors
    */
    const hasErrors = computed(() => Object.values(errors).some((error) => error !== null))
    
    const addFile = (file: File): boolean => {
        if (!validateSizeLimit(file) || !validateType(file)) return false ;
        
        let newFile = reactive<FileFormat>({
            id: useId(),
            name: file.name,
            size: file.size,
            type: file.type,
            extension: file.name.split('.').pop(),
            formattedSize: formatBytes(file.size, formatSize),
            raw: file,
            progress: 0,
            completed: false,
            processing: false,
            upload: function(newHeaders?: object) {
                if (presigned) {
                    // Assumes you are always making a post request to server, file method refers to 'option' method
                    axios({
                        method: 'post',
                        url: url,
                        data: {
                            name: this.name,
                            size: this.size,
                            type: this.type,
                            extension: this.extension,
                        },
                        headers: {
                            'Content-Type': 'application/json',
                        }
                    }).then(async (response) => {
                        this.processing = true
                        this.data = response.data

                        const formData = new FormData();
                        formData.append('file', this.raw);

                        await axios({
                            url: response.data.url,
                            data: this.raw,
                            onUploadProgress: (progressEvent) => {
                                this.progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                            },
                            headers: {
                                ...headers,
                                ...newHeaders,
                                'Content-Type': this.type,
                            }
                        }).then((_) => {
                            this.completed = true

                        }).catch((error) => {
                            errors.endpoint = formatEndpointError(file.name, error.response?.data?.message || error);
                        })
                    }).catch((error) => {
                        errors.endpoint = formatEndpointError(file.name, error.response?.data?.message || error);
                    }).finally(() => {
                        this.processing = false;
                    })

                    return
                }
                
                this.processing = true
                if (chunkSize !== null) {
                    const uploader = createUpload({
                        endpoint: url,
                        method: method.toUpperCase() as AllowedMethod,
                        file: this.raw,
                        chunkSize: chunkSize,
                        headers: {
                            ...headers,
                            ...newHeaders
                        }
                    })

                    uploader.on('progress', (progress) => {
                        this.progress = progress
                    })

                    uploader.on('success', () => {
                        this.completed = true
                        this.processing = false
                    })

                    uploader.on('error', (error) => {
                        errors.endpoint = formatEndpointError(this.name, error);
                        this.completed = true
                        this.processing = false
                    })

                    this.cancel = () => uploader.abort()
                    this.pause = () => uploader.pause()
                    this.resume = () => uploader.resume()

                    return
                }
                
                const formData = new FormData();
                formData.append('file', this.raw);
                
                axios({
                    method: method,
                    url: url,
                    data: formData,
                    onUploadProgress: (progressEvent) => {
                        this.progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    },
                    headers: {
                        ...headers,
                        ...newHeaders,
                        'Content-Type': 'multipart/form-data', // Set content type for file upload
                    },
                })
                .then((response) => {
                    this.data = response.data
                })
                .catch((error) => {
                    errors.endpoint = error.response?.data?.message || formatEndpointError(file.name, error);
                })
                .finally(() => {
                    this.completed = true;
                    this.processing = false;
                });
                
            },
            pause: function() {},
            resume: function() {},
            cancel: function() {}
        })
        
        files.value.unshift(newFile)
        return true
    }
    
    /**
    * Remove a file from the list by the unique id
    * @param id 
    */
    const removeFile = (id: number) => {
        files.value = files.value.filter((file) => file.id !== id)
    }
    
    /**
    * Remove a file from the list by index
    * @param index 
    */
    const removeFileByIndex = (index: number) => {
        files.value.splice(index, 1)
    }
    
    /**
    * Clear all files from the list
    */
    const clearFiles = () => {
        files.value = []
    }
    
    onMounted(() => {
        input.value.addEventListener('change', (event: Event) => {
            clearErrors()
            const fileInput = event.target as HTMLInputElement
            const fileList = fileInput.files as FileList
            
            /** If the filelist is going to exceed limit, then do not process */
            if (!validateFileLimit(fileList)) return
            
            Array.from(fileList).forEach((file: File) => {         
                if (!addFile(file) && stopOnError) return
            });
            
            if (immediate) {
                files.value.forEach((file) => {
                    file.upload()
                })
            }
        })
    })
    
    /**
    * Get the first matching error or undefined
    */
    const error = computed(() => Object.values(errors).find((error) => error !== null))
    
    return reactive({
        /**
        * Array containing the files
        */
        files,
        /**
        * Number of files uploaded
        */
        count,
        /**
        * Add a file to the list
        */
        addFile,
        /**
        * Remove a file from the list
        */
        removeFile,
        /**
        * Remove a file from the list by index
        */
        removeFileByIndex,
        /**
        * Clear all files from the list
        */
        clearFiles,
        /**
        * Error messages
        */
        errors,
        /**
        * Get a single error message
        */
        error,
        /**
        * Clear all errors
        */
        clearErrors,
        /**
        * Check if there are any errors
        */
        hasErrors,
        /**
        * Method to bind to onDrop event to handle
        */
        // onDrop
        /**
        * Uploader type
        */
        uploaderType
        
    })
}