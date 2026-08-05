declare global {
  interface Window {
    mapkit?: any
    __rwAppleMapsPromise?: Promise<any>
  }
}

/**
 * Loads the one Apple MapKit instance used by both the hotel map and the
 * destination picker. Supplying the token on the script tag lets MapKit
 * initialise itself before any map or place-search service is created.
 */
export function loadAppleMapKit(): Promise<any> {
  if (window.mapkit) return Promise.resolve(window.mapkit)
  if (window.__rwAppleMapsPromise) return window.__rwAppleMapsPromise

  window.__rwAppleMapsPromise = (async () => {
    const response = await fetch("/api/apple-maps-token")
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data.token) throw new Error(data.error || "Apple Maps token request failed")

    return new Promise<any>((resolve, reject) => {
      const script = document.createElement("script")
      script.src = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js"
      script.async = true
      script.crossOrigin = "anonymous"
      script.dataset.token = data.token
      script.onload = () => {
        if (window.mapkit) resolve(window.mapkit)
        else reject(new Error("Apple Maps loaded without a MapKit service"))
      }
      script.onerror = () => reject(new Error("Apple Maps failed to load"))
      document.head.appendChild(script)
    })
  })().catch((error) => {
    // A failed load must not poison future attempts in this browser session.
    window.__rwAppleMapsPromise = undefined
    throw error
  })

  return window.__rwAppleMapsPromise
}
