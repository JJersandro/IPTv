// Tijdelijke proef (Node-runtime, stijl: named GET). Wordt weer verwijderd.
export function GET(){ return new Response('ping-get ok ' + process.version, { headers: { 'content-type': 'text/plain' } }); }
