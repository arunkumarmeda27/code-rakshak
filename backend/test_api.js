import fetch from 'node-fetch';

async function testServer() {
    console.log("Sending POST to http://localhost:3000/api/analyze");
    try {
        const res = await fetch('http://localhost:3000/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: "https://example.com" })
        });
        
        console.log("Status:", res.status);
        if (!res.ok) {
            const data = await res.json();
            console.log("Error Data:", JSON.stringify(data, null, 2));
        } else {
            console.log("Success! Headers:", res.headers.raw());
            console.log("Wait, we got a PDF!");
        }
    } catch (e) {
        console.error("Fetch failed:", e);
    }
}

testServer();
