import { AlertCircle, LoaderCircle } from 'lucide-react';
export function Loading({ label = 'Loading your workspace…' }) { return <div className="feedback"><LoaderCircle className="spin" size={20}/><span>{label}</span></div>; }
export function ErrorNotice({ error, retry }) { return <div className="notice error"><AlertCircle size={18}/><span>{error?.message || String(error)}</span>{retry && <button className="text-button" onClick={retry}>Try again</button>}</div>; }
export function Empty({ title, detail, action }) { return <div className="empty"><span className="empty-mark">Q</span><h3>{title}</h3><p>{detail}</p>{action}</div>; }
