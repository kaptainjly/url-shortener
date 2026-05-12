import { useState } from "react";
import axios from "axios";
import "./App.css";

function App() {
  const [url, setUrl] = useState("");
  const [expiresInMinutes, setExpiresInMinutes] = useState("");
  const [shortUrl, setShortUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const API_BASE = "https://url-shortener-62ae.onrender.com";

  const shortenUrl = async () => {
    try {
      setLoading(true);
      setError("");
      setShortUrl("");

      const response = await axios.post(`${API_BASE}/shorten`, {
        url,
        expiresInMinutes: expiresInMinutes
          ? Number(expiresInMinutes)
          : null,
      });

      setShortUrl(response.data.shortUrl);
    } catch (err) {
  console.log("FULL ERROR:", err.response?.data || err.message);
  setError("Failed to shorten URL");
} finally {
      setLoading(false);
    }

    console.log("Sending request to:", API_BASE);
    console.log("Payload:", { url, expiresInMinutes });
  };

  return (
    <div className="container">
      <div className="card">
        <h1>URL Shortener</h1>

        <input
          type="text"
          placeholder="Enter long URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />

        <input
          type="number"
          placeholder="Expiry in minutes (optional)"
          value={expiresInMinutes}
          onChange={(e) => setExpiresInMinutes(e.target.value)}
        />

        <button onClick={shortenUrl} disabled={loading}>
          {loading ? "Creating..." : "Shorten URL"}
        </button>

        {shortUrl && (
          <div className="result">
            <p>Short URL:</p>
            <a href={shortUrl} target="_blank">
              {shortUrl}
            </a>
          </div>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

export default App;