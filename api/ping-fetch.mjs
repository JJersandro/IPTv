// Tijdelijke proef (Node-runtime, stijl: default { fetch }). Wordt weer verwijderd.
export default { fetch(){ return new Response('ping-fetch ok ' + process.version, { headers: { 'content-type': 'text/plain' } }); } };
