/* Service and transfer locations checked against MARTA's Reach page and GTFS on 2026-11-23.
   GTFS locations are fixed-route references. Confirm actual Reach pickup in the booking app. */
(function(){
  'use strict';
  const source='https://itsmarta.com/reach.aspx';
  const gtfs='https://itsmarta.com/app-developer-resources.aspx';
  const checked='2026-11-23';
  const southDeKalb={
    name:'South DeKalb Transfer Point',service:'Bus 15, 20, 34, 74, 109 and 111',
    stops:[['130120',-84.269213,33.709784],['130180',-84.269268,33.709713]]
  };
  const byZone={
    303:[{name:'Barge Road Park-and-Ride',service:'Bus 83',stops:[['144008',-84.506209,33.688216]]}],
    304:[
      {name:'Lakewood/Ft. McPherson Station',service:'Red and Gold rail',stops:[['510022',-84.42883,33.70042]]},
      {name:'Carver Station',service:'Rapid A-Line',stops:[['213861',-84.388243,33.722287]],notice:'Check current A-Line boarding information.',url:'https://itsmarta.com/Aline.aspx'}
    ],
    305:[{name:'South Fulton Transfer Point',service:'Bus 89, 180, 182, 184 and 189',stops:[
      ['213373',-84.539411,33.570761],['213374',-84.539204,33.570753]
    ]}],
    308:[{name:'Panola Park-and-Ride',service:'Bus 114 and 117',stops:[['520003',-84.17333,33.70196]]}],
    309:[southDeKalb],310:[southDeKalb],311:[southDeKalb]
  };
  window.TracksideReachService={source,gtfs,checked,hours:'Daily, 6 a.m. to midnight',byZone};
})();
