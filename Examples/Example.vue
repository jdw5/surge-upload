<template>
    <input ref="file" type="file"/>
</template>

<script setup>
import { ref } from 'vue'
import { useUpload } from '@/Uplink/use-upload'

const file = ref()

const upload = useUpload(file, {
    immediate: true,
    url: route('file.store')
})

</script>