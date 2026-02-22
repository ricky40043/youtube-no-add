import { useState, useEffect } from 'react'

export function useIsMobile(breakpoint = 768) {
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        const checkMobile = () => {
            const width = window.innerWidth
            const userAgent = navigator.userAgent || navigator.vendor || window.opera
            
            const isMobileWidth = width <= breakpoint
            const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase())
            
            setIsMobile(isMobileWidth || isMobileUA)
        }

        checkMobile()
        
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [breakpoint])

    return isMobile
}

export default useIsMobile
