import {ref} from 'vue'
import {defineStore} from 'pinia'

export const useGuidedTourStore = defineStore('guidedTour', () => {
	const requested = ref(false)

	function show() {
		requested.value = true
	}

	function hide() {
		requested.value = false
	}

	return {
		requested,
		show,
		hide,
	}
})
