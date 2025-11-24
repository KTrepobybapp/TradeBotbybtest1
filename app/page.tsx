import BalanceCard from "../components/BalanceCard";
import TradingPanel from "../components/TradingPanel";
import PositionsTable from "../components/PositionsTable";
import HistoryTable from "../components/HistoryTable";

export default function Page() {
  return (
    <div className="container mx-auto p-4">
      <div className="flex flex-col gap-4">
        <BalanceCard />
        <TradingPanel />
        <PositionsTable />
        <HistoryTable />
      </div>
    </div>
  );
}