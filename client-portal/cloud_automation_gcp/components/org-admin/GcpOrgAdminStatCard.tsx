'use client';

interface GcpOrgAdminStatCardProps {
  label: string;
  value: number;
  color: 'green' | 'orange' | 'blue' | 'purple';
  icon: string;
  onClick?: () => void;
  active?: boolean;
}

const colorClasses = {
  green: 'text-green-700',
  orange: 'text-orange-700',
  blue: 'text-blue-700',
  purple: 'text-violet-700',
};

export function GcpOrgAdminStatCard({
  label,
  value,
  color,
  icon,
  onClick,
  active = false,
}: GcpOrgAdminStatCardProps) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`flex items-center gap-3.5 rounded-xl border bg-white px-5 py-4 transition ${
        onClick ? 'cursor-pointer hover:border-blue-300 hover:shadow-sm' : ''
      } ${active ? 'border-[#B91C1C] shadow-[0_0_0_3px_rgba(185,28,28,0.12)]' : 'border-gray-200'}`}
    >
      <span className="text-xl">{icon}</span>
      <div>
        <div className={`text-2xl font-bold leading-none ${colorClasses[color]}`}>{value}</div>
        <div className="mt-0.5 text-xs text-gray-500">{label}</div>
      </div>
    </div>
  );
}
