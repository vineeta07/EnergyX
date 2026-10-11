/** Upcycling ideas shown in the resident app. Written for a household with ordinary tools. */
export interface Idea {
  slug: string; title: string; category: string; minutes: number; level: "Easy" | "Needs care";
  blurb: string; need: string[]; steps: string[]; tip: string;
}

export const IDEA_CATEGORY: Record<string, string> = {
  pet_bottle: "Plastic bottles", hdpe_container: "Detergent bottles", glass_container: "Glass jars", textile: "Old clothes",
  cardboard: "Cardboard", metal_can: "Tin cans", newspaper: "Newspaper", organic: "Kitchen scraps",
};

export const IDEAS: Idea[] = [
  {
    slug: "self-watering-bottle-planter", title: "A planter that waters itself", category: "pet_bottle", minutes: 15, level: "Easy",
    blurb: "One soft drink bottle becomes a pot that keeps tulsi, mint or coriander watered for a week.",
    need: ["A 1 or 2 litre bottle with its cap", "A strip of old cotton cloth or thick thread", "Scissors or a cutter", "A nail", "Soil and a seedling"],
    steps: [
      "Cut the bottle in two, a little above the middle.",
      "Heat the nail and make a hole in the cap. Push the cloth strip through so half hangs out on each side.",
      "Screw the cap back on and turn the top half upside down into the bottom half.",
      "Fill the top with soil and plant the seedling, keeping the cloth buried in the soil.",
      "Pour water into the bottom half. The cloth pulls it up as the soil dries.",
    ],
    tip: "Top up the water when the bottom looks empty, and keep it out of harsh afternoon sun so the plastic lasts.",
  },
  {
    slug: "detergent-bottle-watering-can", title: "A watering can from a detergent bottle", category: "hdpe_container", minutes: 10, level: "Easy",
    blurb: "Thick bottles with a handle are already most of a watering can.",
    need: ["A detergent or fabric softener bottle with a cap", "A nail or a thick needle", "Pliers and a flame"],
    steps: [
      "Wash the bottle until the water runs clear and there is no foam left.",
      "Hold the nail in pliers, heat it, and make ten to twelve small holes in the cap.",
      "Make one hole near the top of the handle so air can get in.",
      "Fill with water, screw the cap on and tip to pour.",
    ],
    tip: "The same bottle, cut at an angle below the handle, makes a scoop for soil, rice or pet food.",
  },
  {
    slug: "glass-jar-kitchen-storage", title: "Matching storage jars for the kitchen", category: "glass_container", minutes: 20, level: "Easy",
    blurb: "Jam, pickle and coffee jars make airtight storage for dal, spices and tea.",
    need: ["Empty glass jars with lids", "Warm water and cooking oil", "Paper or masking tape for labels", "Paint for the lids, if you like"],
    steps: [
      "Soak the jars in warm soapy water for half an hour and peel off the labels.",
      "Rub any sticky patch with a drop of cooking oil, then wash again.",
      "Dry the jars and lids completely in the sun so nothing smells.",
      "Paint the lids one colour if you want a set, and let them dry.",
      "Label each jar and fill it.",
    ],
    tip: "A jar with a candle or a string of fairy lights inside makes a lantern for the balcony.",
  },
  {
    slug: "no-sew-tshirt-bag", title: "A shopping bag from an old T-shirt, no sewing", category: "textile", minutes: 15, level: "Easy",
    blurb: "A stretched or stained T-shirt turns into a strong bag for vegetables.",
    need: ["An old T-shirt", "Sharp scissors", "A ruler or a plate to mark curves"],
    steps: [
      "Cut off both sleeves along the seams. These openings become the handles.",
      "Cut the neck into a wider, deeper curve for the mouth of the bag.",
      "Turn the shirt inside out and cut a fringe along the bottom, strips about two fingers wide and a hand long.",
      "Tie each front strip to the back strip behind it with a double knot.",
      "Then tie each knotted pair to the pair beside it so no gaps are left. Turn it right side out.",
    ],
    tip: "Thicker cotton shirts carry more weight. Keep one folded in your everyday bag.",
  },
  {
    slug: "denim-pocket-organiser", title: "A wall organiser from old jeans", category: "textile", minutes: 40, level: "Needs care",
    blurb: "Back pockets hold chargers, keys, pens and remote controls by the door or the desk.",
    need: ["One or two pairs of old jeans", "A stiff piece of cardboard or a cloth panel", "Fabric glue or a needle and thread", "A hanger or two hooks"],
    steps: [
      "Cut out the back pockets, leaving a finger-width of cloth around each.",
      "Cut one trouser leg open and flatten it to make the backing panel.",
      "Arrange the pockets on the panel and glue or stitch them on three sides, leaving the top open.",
      "Fold the top edge of the panel over a hanger and stitch or glue it down.",
      "Let the glue set overnight before you fill the pockets.",
    ],
    tip: "The waistband with its belt loops makes a hanging rail for keys.",
  },
  {
    slug: "cardboard-drawer-dividers", title: "Drawer dividers from a delivery box", category: "cardboard", minutes: 20, level: "Easy",
    blurb: "A grid of cardboard strips keeps socks, stationery or spice packets in their own squares.",
    need: ["A sturdy cardboard box", "A ruler and pencil", "A cutter", "Paper or cloth to cover, if you like"],
    steps: [
      "Measure the inside of the drawer: length, width and height.",
      "Cut strips as tall as the drawer. You need some as long as the drawer and some as wide.",
      "Mark where the strips cross and cut a slot halfway through each strip at every mark.",
      "Slide the strips together at the slots to form a grid.",
      "Drop the grid into the drawer.",
    ],
    tip: "Cut along the ridges of the cardboard for the long strips. They bend less that way.",
  },
  {
    slug: "tin-can-pen-stand", title: "A pen stand or herb pot from a tin can", category: "metal_can", minutes: 20, level: "Needs care",
    blurb: "A food tin is the right size for pens, brushes, cutlery or a small plant.",
    need: ["A clean steel can", "A spoon or pliers", "Jute rope, cloth or paint", "Glue", "A nail and hammer, for a plant pot"],
    steps: [
      "Press the sharp inner rim flat with the back of a spoon or with pliers. Check it with a cloth, not a finger.",
      "Wash off the label and glue, and dry the can well so it does not rust.",
      "Wind jute rope around it with glue, or paint it, or wrap it in cloth.",
      "For a plant, punch three holes in the base with the nail first.",
    ],
    tip: "Three cans glued side by side make a desk set for pens, scissors and brushes.",
  },
  {
    slug: "newspaper-bag", title: "A paper bag from two sheets of newspaper", category: "newspaper", minutes: 10, level: "Easy",
    blurb: "Strong enough for fruit, bread or a gift, and it replaces a plastic carry bag.",
    need: ["Two full sheets of newspaper", "Glue or flour paste", "A piece of string for handles"],
    steps: [
      "Lay the two sheets on top of each other. Fold the top long edge down by two fingers and glue it. This is the mouth.",
      "Bring the two short sides together so they overlap by two fingers, and glue them to make a tube.",
      "Flatten the tube. Fold the bottom up by a hand's width and crease it.",
      "Open that fold, press the corners in to make two triangles, then fold the flaps over each other and glue.",
      "Punch two holes near the mouth on each side and knot the string through them.",
    ],
    tip: "Flour and water boiled into a paste works as well as glue.",
  },
  {
    slug: "bucket-compost", title: "Compost in a bucket on the balcony", category: "organic", minutes: 30, level: "Easy",
    blurb: "Kitchen scraps become dark, crumbly compost in six to eight weeks, with no smell if you keep it balanced.",
    need: ["A bucket or old paint drum with a lid", "A nail or drill", "Dry leaves, torn newspaper or cocopeat", "A handful of soil or old compost"],
    steps: [
      "Make holes around the sides and in the base so air gets in. Stand the bucket on a tray.",
      "Start with a layer of dry leaves or torn paper, then a handful of soil.",
      "Add the day's vegetable and fruit peels, tea leaves and eggshells. Cover every layer with the same amount of dry leaves or paper.",
      "Stir it every three or four days. If it smells or looks wet, add more dry material.",
      "When the bucket is full, close it and leave it for four weeks. Start a second bucket meanwhile.",
    ],
    tip: "Leave out cooked food, dairy and meat until you are used to it. They attract flies.",
  },
];
