export type Station =
  | "Vyttila"
  | "Edapally"
  | "MG Road"
  | "Aluva"
  | "Palarivattom"
  | "Kaloor"
  | "Kadavanthra"
  | "Ernakulam South";

export type RouteKey = `${Station}:${Station}`;

export type DestinationAddress = {
  label: string;
  line1: string;
  line2: string;
};

export type MetroDemoData = {
  stations: Station[];
  countdownSecondsByRoute: Record<RouteKey, number>;
  triggerThresholdSeconds: number;
  product: string;
  destinationAddresses: Record<Station, DestinationAddress>;
  uber: {
    driver: string;
    car: string;
    eta: string;
    pickup: string;
  };
};

const stations: Station[] = [
  "Vyttila",
  "Edapally",
  "MG Road",
  "Aluva",
  "Palarivattom",
  "Kaloor",
  "Kadavanthra",
  "Ernakulam South",
];

function pair(boarding: Station, destination: Station): RouteKey {
  return `${boarding}:${destination}`;
}

function routeSeconds(boarding: Station, destination: Station) {
  const distance = Math.abs(stations.indexOf(boarding) - stations.indexOf(destination));
  if (distance === 0) {
    return 0;
  }

  // DEMO DATA — replace with live KMRL feed in production.
  // Fast values keep the hackathon demo moving while preserving the visible countdown behavior.
  return Math.max(90, distance * 120);
}

const countdownSecondsByRoute = stations.reduce(
  (routes, boarding) => {
    stations.forEach((destination) => {
      routes[pair(boarding, destination)] = routeSeconds(boarding, destination);
    });
    return routes;
  },
  {} as Record<RouteKey, number>,
);

export const metroDemoData: MetroDemoData = {
  stations,
  countdownSecondsByRoute,
  // DEMO DATA — hardcoded stage trigger. Production should derive this from prep time and live ETA.
  triggerThresholdSeconds: 60,
  // DEMO DATA — hardcoded cart item so judges see a deterministic flow.
  product: "banana chips",
  // DEMO DATA — replace with user-entered or profile-backed delivery locations in production.
  destinationAddresses: {
    Vyttila: {
      label: "Vyttila Hub",
      line1: "Near Vyttila Metro Station",
      line2: "Kochi, Kerala",
    },
    Edapally: {
      label: "Edapally Stop",
      line1: "Near Edapally Metro Station",
      line2: "Kochi, Kerala",
    },
    "MG Road": {
      label: "MG Road Stop",
      line1: "Near MG Road Metro Station",
      line2: "Kochi, Kerala",
    },
    Aluva: {
      label: "Aluva Stop",
      line1: "Near Aluva Metro Station",
      line2: "Kochi, Kerala",
    },
    Palarivattom: {
      label: "Palarivattom Stop",
      line1: "Near Palarivattom Metro Station",
      line2: "Kochi, Kerala",
    },
    Kaloor: {
      label: "Kaloor Stop",
      line1: "Near Kaloor Metro Station",
      line2: "Kochi, Kerala",
    },
    Kadavanthra: {
      label: "Kadavanthra Stop",
      line1: "Near Kadavanthra Metro Station",
      line2: "Kochi, Kerala",
    },
    "Ernakulam South": {
      label: "Ernakulam South Stop",
      line1: "Near Ernakulam South Metro Station",
      line2: "Kochi, Kerala",
    },
  },
  // DEMO DATA — mocked ride-hailing state only. No Uber APIs or automation are called.
  uber: {
    driver: "Akhil P.",
    car: "White Swift Dzire · KL 07 CX 4210",
    eta: "4 min",
    pickup: "Exit Gate 2",
  },
};
