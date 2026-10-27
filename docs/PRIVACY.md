# PackWise privacy statement

- No accounts, analytics, advertising, tracking or telemetry. No cookies.
- Trips, packing lists, tasks and templates are stored only in your browser (IndexedDB). Preferences (theme, name, accent) are in `localStorage`.
- The only network traffic is loading PackWise's own files from where it is hosted; the service worker then serves them offline. An automated test fails if any request leaves the app's origin or any non-GET request is made.
- The destination guide, food guide and item pictures are bundled with the app. Nothing about your trips, saved places, own places, notes or day plans is ever sent anywhere.
- Links such as "Google Maps", "OpenStreetMap" and "Read more" (Wikipedia) are ordinary links **you** choose to open in a new tab. They contain only the place name you clicked (never your trip, dates or notes), carry `rel="noopener noreferrer"`, and the site's `Referrer-Policy: no-referrer` stops the page address being sent. Those sites then apply their own privacy policies.
- Stored on your device: trips, lists, tasks, templates, saved places and dishes, your own places, day plans, notes and hidden packing ideas (IndexedDB, included in backups), and preferences such as theme, background colors, accent, home country and dismissed tips (`localStorage`, not in backups).
- Backups, text exports and printouts are created on your device. Nothing is uploaded.
- Clearing site data, using private browsing or low storage can erase your trips. Export a backup regularly (Settings → Data).
