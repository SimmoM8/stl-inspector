const fileInput = document.getElementById("fileInput");
const output = document.getElementById("output");

fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    output.textContent = "Uploading and analyzing...";

    try {
        const res = await fetch("http://127.0.0.1:5000/api/analyze", {
            method: "POST",
            body: formData
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        output.textContent = JSON.stringify(data.summary, null, 2);

        console.log("Full response:", data);
    } catch (err) {
        output.textContent = "Error: " + err.message;
    }
});