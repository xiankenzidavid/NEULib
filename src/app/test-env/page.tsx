// app/test-env/page.tsx (App Router)
// or pages/test-env.tsx (Pages Router)

export default function TestEnvPage() {
  return (
    <div style={{ padding: "2rem", fontFamily: "Arial" }}>
      <h1>Environment Variable Test</h1>
      <p><strong>Firebase API Key:</strong> {process.env.NEXT_PUBLIC_FIREBASE_API_KEY}</p>
      <p><strong>Firebase Project ID:</strong> {process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}</p>
      <p><strong>Gemini API Key Loaded:</strong> {process.env.GEMINI_API_KEY ? "Yes" : "No"}</p>
    </div>
  );
}
