import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
// Clear legacy localStorage keys so app relies only on Supabase for persistence
if (typeof window !== 'undefined' && window.localStorage) {
	const keysToRemove = ['knockturn_current_user', 'user_id', 'knockturn_users', 'knockturn_leaves', 'knockturn_user'];
	keysToRemove.forEach(k => localStorage.removeItem(k));
}

createRoot(document.getElementById("root")!).render(<App />);
