import BalanceCard from "../components/BalanceCard";
import TradingPanel from "../components/TradingPanel";
import PositionsTable from "../components/PositionsTable";
import HistoryTable from "../components/HistoryTable";

export default function Page() {
  return (
    <div className="container mx-auto p-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-1">
          <BalanceCard />
        </div>
        <div className="md:col-span-3 flex flex-col gap-4">
          <TradingPanel />
          <PositionsTable />
          <HistoryTable />
        </div>
      </div>
    </div>
  );
}