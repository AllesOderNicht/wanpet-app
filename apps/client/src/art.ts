export const art = {
  interior: new URL('../../../assets/exports/scenes/home/interior-v1.webp', import.meta.url).href,
  courtyard: new URL('../../../assets/exports/scenes/home/courtyard-v1.webp', import.meta.url).href,
  home: new URL('../../../assets/exports/ui/icons/home-v1.webp', import.meta.url).href,
  trip: new URL('../../../assets/exports/ui/icons/trip-v1.webp', import.meta.url).href,
  collection: new URL('../../../assets/exports/ui/icons/collection-v1.webp', import.meta.url).href,
  bag: new URL('../../../assets/exports/ui/icons/bag-v1.webp', import.meta.url).href,
};
export const items = [
  { id: 'bento', name: '便当', quantity: 3, image: new URL('../../../assets/exports/items/bento-v1.webp', import.meta.url).href },
  { id: 'biscuit', name: '饼干', quantity: 2, image: new URL('../../../assets/exports/items/biscuit-v1.webp', import.meta.url).href },
  { id: 'water', name: '水壶', quantity: 2, image: new URL('../../../assets/exports/items/water-bottle-v1.webp', import.meta.url).href },
  { id: 'map', name: '地图', quantity: 1, image: new URL('../../../assets/exports/items/map-v1.webp', import.meta.url).href },
  { id: 'towel', name: '毛巾', quantity: 0, image: new URL('../../../assets/exports/items/towel-v1.webp', import.meta.url).href },
  { id: 'lantern', name: '小提灯', quantity: 1, image: new URL('../../../assets/exports/items/lantern-v1.webp', import.meta.url).href },
];
export const iconBounds = {
  home: [230, 291, 794, 697], trip: [135, 265, 1037, 764],
  collection: [287, 236, 720, 814], bag: [201, 322, 1005, 684],
};
