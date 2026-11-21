import type { ServiceMeta } from '@/data/repositories/contentRepository';

export interface ServiceFormValues {
  code: string;
  name: string;
  serviceType: 'tour' | 'transfer';
  cityId: string | null;
  operatorId: string | null;
  description: string | null;
  itineraryTitle: string | null;
  itineraryText: string | null;
  inclusionText: string | null;
  consumesDay: boolean;
  addsNight: boolean;
  transferDirection: 'one_way' | 'round_trip' | null;
  sortOrder: number;
  isActive: boolean;
}

export function emptyService(): ServiceFormValues {
  return {
    code: '',
    name: '',
    serviceType: 'tour',
    cityId: null,
    operatorId: null,
    description: null,
    itineraryTitle: null,
    itineraryText: null,
    inclusionText: null,
    consumesDay: true,
    addsNight: false,
    transferDirection: null,
    sortOrder: 0,
    isActive: true,
  };
}

export function fromService(service: ServiceMeta): ServiceFormValues {
  return {
    code: service.code,
    name: service.name,
    serviceType: service.serviceType,
    cityId: service.cityId,
    operatorId: service.operatorId,
    description: service.description,
    itineraryTitle: service.itineraryTitle,
    itineraryText: service.itineraryText,
    inclusionText: service.inclusionText,
    consumesDay: service.consumesDay,
    addsNight: service.addsNight,
    transferDirection: service.transferDirection,
    sortOrder: service.sortOrder,
    isActive: service.isActive,
  };
}
