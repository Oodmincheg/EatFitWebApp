const DISHES = [
  '🍅 Shakshuka',
  '🥑 Green power bowl',
  '🍗 Lemon herb chicken',
  '🥞 Banana oat pancakes',
  '🍜 Miso noodle soup',
  '🥗 Crunchy chopped salad',
  '🍠 Roast veg traybake',
  '🍓 Berry yogurt bowl',
];

/** Infinite scrolling dish ticker — content doubled so the -50% loop is seamless. */
export function Marquee() {
  return (
    <div aria-hidden="true" className="overflow-hidden py-5">
      <div className="-mx-4 -rotate-1 overflow-hidden border-y-2 border-ink bg-lime py-3.5">
        <div className="anim-marquee flex w-max items-center hover:[animation-play-state:paused]">
          {[...DISHES, ...DISHES].map((dish, i) => (
            <span
              key={i}
              className="flex items-center whitespace-nowrap text-[15px] font-bold text-white"
            >
              <span className="px-5">{dish}</span>
              <span className="text-white/60">✦</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
