import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, AlertCircle } from 'lucide-react';
import './LeaveBalanceCard.css';

interface LeaveBalance {
    casual: { total: number; used: number; remaining: number };
    sick: { total: number; used: number; remaining: number };
}

interface LeaveBalanceCardProps {
    balance: LeaveBalance | null;
    loading?: boolean;
    className?: string; // Allow passing styles
}

export const LeaveBalanceCard: React.FC<LeaveBalanceCardProps> = ({ balance, loading, className }) => {
    if (loading || !balance) {
        return (
            <Card className={`${className} animate-pulse`}>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <div className="w-5 h-5 bg-white/10 rounded-full" />
                        <div className="w-32 h-6 bg-white/10 rounded" />
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {[1, 2].map(i => (
                        <div key={i} className="space-y-3">
                            <div className="flex justify-between">
                                <div className="w-40 h-4 bg-white/10 rounded" />
                                <div className="w-12 h-4 bg-white/10 rounded" />
                            </div>
                            <div className="w-full h-2.5 bg-white/5 rounded" />
                        </div>
                    ))}
                </CardContent>
            </Card>
        );
    }

    const casualPercent = (balance.casual.used / balance.casual.total) * 100;
    const sickPercent = (balance.sick.used / balance.sick.total) * 100;

    return (
        <Card className={className}>
            <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                    <PieChart className="w-5 h-5 text-primary" />
                    Leave Balance
                </CardTitle>
            </CardHeader>

            <CardContent className="space-y-8">
                {/* Personal Leave */}
                <div className="leave-type-item">
                    <div className="type-info">
                        <span className="type-label">Personal (Casual) Leave</span>
                        <div className="type-ratio">
                            <span className="ratio-used">{balance.casual.used}</span>
                            <span className="ratio-total"> / {balance.casual.total}</span>
                        </div>
                    </div>
                    <div className="progress-track">
                        <div
                            className="progress-fill fill-personal"
                            style={{ width: `${Math.min(100, casualPercent)}%` }}
                        />
                    </div>
                </div>

                {/* Sick Leave */}
                <div className="leave-type-item">
                    <div className="type-info">
                        <span className="type-label">Sick Leave</span>
                        <div className="type-ratio">
                            <span className="ratio-used">{balance.sick.used}</span>
                            <span className="ratio-total"> / {balance.sick.total}</span>
                        </div>
                    </div>
                    <div className="progress-track">
                        <div
                            className="progress-fill fill-sick"
                            style={{ width: `${Math.min(100, sickPercent)}%` }}
                        />
                    </div>
                </div>

                <div className="pt-2 border-t border-white/5 text-[10px] text-muted-foreground flex items-center gap-2">
                    <AlertCircle className="w-3 h-3 text-cyan-500" />
                    <span>Balances reset on Jan 1st of every year.</span>
                </div>
            </CardContent>
        </Card>
    );
};
