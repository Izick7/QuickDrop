import { ArrowUpRight, Package } from 'lucide-react';
import { Link } from 'react-router-dom';
import { dateTime, money, titleCase } from '../utils/format';
export default function DeliveryTable({ rows = [], base = '/app/deliveries' }) {
  if (!rows.length) return <div className="table-empty"><Package size={22}/><span>No deliveries to show yet.</span></div>;
  return <div className="table-wrap"><table><thead><tr><th>Delivery</th><th>Route</th><th>Status</th><th>Created</th><th>Price</th><th/></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td><b>QD-{String(item.id).slice(0, 8).toUpperCase()}</b><small>{item.packageDescription}</small></td><td><span className="route-cell">{item.pickupAddress}<i>→</i>{item.dropoffAddress}</span></td><td><span className={`status status-${item.status?.toLowerCase()}`}>{titleCase(item.status)}</span></td><td>{dateTime(item.createdAt)}</td><td>{money(item.price)}</td><td><Link aria-label="View delivery" className="icon-button" to={`${base}/${item.id}`}><ArrowUpRight size={17}/></Link></td></tr>)}</tbody></table></div>;
}
