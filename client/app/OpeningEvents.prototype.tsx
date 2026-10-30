// Dev-only host for the throwaway HTML artifact; production rendering never imports it.
export default function OpeningEventsPrototype() {
  return <iframe
    title="LE opening events interaction prototype"
    src={`${import.meta.env.BASE_URL}client/app/OpeningEvents.prototype.html${window.location.search}`}
    style={{ width: '100%', height: '100dvh', border: 0, display: 'block' }}
  />
}
