import { VehicleHistory } from '../types';
import { isWithinInterval, subDays, parse } from 'date-fns';

export const filterHistoryByDays = (history: VehicleHistory[], days: number) => {
  let referenceDate = new Date();
  if (history.length > 0) {
    referenceDate = history.reduce((max, record) => {
      const recordDate = parse(record.checkoutTime, 'yyyy-MM-dd HH:mm:ss', new Date());
      return recordDate > max ? recordDate : max;
    }, new Date(0));
  }

  const startDate = subDays(referenceDate, days);

  console.log('--- Filtro de Datas ---');
  console.log('referenceDate (now):', referenceDate);
  console.log('startDate:', startDate);

  return history.filter((record) => {
    const checkoutDate = parse(record.checkoutTime, 'yyyy-MM-dd HH:mm:ss', new Date());
    console.log(`Registro ${record.id} - checkoutTime: ${record.checkoutTime}`);
    console.log(`Registro ${record.id} - checkoutDate convertido:`, checkoutDate);

    const dentroDoIntervalo = isWithinInterval(checkoutDate, { start: startDate, end: referenceDate });
    console.log(`Registro ${record.id} - está dentro do intervalo?`, dentroDoIntervalo);
    return dentroDoIntervalo;
  });
};

export const filterLast24Hours = (history: VehicleHistory[]) => {
  return filterHistoryByDays(history, 1);
};
