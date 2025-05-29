import { useCallback, useEffect, useState } from 'react';
import { TonConnectUI } from '@tonconnect/ui-react';

export function useTonConnect() {
  const [user, setUser] = useState<any>(null);
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    const tonConnectUI = new TonConnectUI({
      manifestUrl: 'https://yourdomain.com/tonconnect-manifest.json'
    });

    tonConnectUI.onStatusChange(wallet => {
      setUser(wallet);
      fetchBalance(wallet);
    });
  }, []);

  const fetchBalance = async (wallet) => {
    const response = await fetch(`/api/balance/${wallet.account.address}`);
    const data = await response.json();
    setBalance(data.balance);
  };

  const deposit = async (amount: number) => {
    // Отправка транзакции через TON Connect
  };

  return { user, balance, deposit };
}