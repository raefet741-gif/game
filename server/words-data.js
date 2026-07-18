// server/words-data.js
// The WORD WONDERS dictionary — 1000+ common English words, 3–7 letters.
//
// Two jobs:
//   1. Puzzle building — the engine picks a 6/7-letter "base" word, finds every
//      dictionary word spellable from its letters, and lays them into a crossword.
//   2. Bonus validation — any extra real word a player forms from the wheel earns
//      bonus coins. This list is the source of truth for "is that a real word?".
//
// Words are stored as compact space-separated strings (far smaller than an array
// of quoted strings). The engine lowercases, keeps only /^[a-z]+$/ of length
// 3–7, and de-duplicates via a Set — so stray whitespace / casing is harmless.

const THREE = `
ace act add ado age ago aid ail aim air ale all amp and ant any ape apt arc are
ark arm art ash ask asp ate awe axe aye bad bag ban bar bat bay bed bee beg bet
bid big bin bit boa bob bog bon boo bow box boy bra bud bug bun bus but buy cab
can cap car cat cob cod cog con cop cot cow coy cry cub cue cup cut dab dad dam
day den dew did die dig dim din dip doe dog don dot dry dub due dug dye ear eat
eel egg ego elf elk elm end eon era eve ewe eye fad fan far fat fax fed fee few
fib fig fin fir fit fix fly foe fog for fox fry fun fur gag gal gap gas gel gem
get gig gin god got gum gun gut guy gym had hag ham has hat hay hem hen her hew
hey hid him hip his hit hoe hog hop hot how hub hue hug hum hut ice icy ill imp
ink inn ion ire irk its ivy jab jam jar jaw jay jet jig job jog jot joy jug jut
keg key kid kin kit lab lad lag lap law lax lay led leg let lid lie lip lit log
lot low mad man map mar mat maw may men met mid mix mob mom mop mud mug mum nab
nag nap net new nib nil nip nod nor not now nun nut oak oar oat odd ode off oil
old one opt orb ore our out owe owl own pad pal pan par pat paw pay pea peg pen
pet pew pie pig pin pit ply pod pop pot pro pry pub pun pup put rag ram ran rap
rat raw ray red rib rid rig rim rip rob rod roe rot row rub rug rum run rut rye
sac sad sag sap sat saw say sea see set sew she shy sin sip sir sit six ski sky
sly sob sod son sop sow soy spa spy sty sub sue sum sun sup tab tag tan tap tar
tax tea ten the thy tic tie tin tip toe tog ton too top tot tow toy try tub tug
two urn use van vat vet vex via vie vow wad wag wan war was wax way web wed wee
wet who why wig win wit woe wok won woo wow yak yam yap yea yen yes yet yew you
zag zap zip zoo
`;

const FOUR = `
able ably ache acid acre aged ages ahoy aide aids ails aims airs ajar akin alas
ales alga ally aloe also alto amid amok amps anew ante anti ants apes apex arch
arcs area ares aria arid arms army arts ashy atom atop aunt auto avid away awed
awry axed axes axis baby back bade bags bail bait bake bald bale balk ball balm
band bane bang bank bans barb bard bare barn bars base bash bask bass bath bats
bays bead beak beam bean bear beat beau beck beds beef been beep beer bees beet
begs bell belt bend bent best bets bevy bias bide bike bile bilk bill bind bird
bite bits blab bled blew blip blob bloc blot blow blue blur boar boas boat body
bogs boil bold bole bolt bomb bond bone bong bony book boom boon boor boos boot
bore born boss both bout bowl bows boys brag bran bras brat bray bred brew brig
brim brow buck buds buff bugs bulb bulk bull bump bums bung bunk buns bunt buoy
burn burp burr bury bush bust busy butt buys buzz byte cabs cafe cage cake calf
call calm came camp cane cans cape caps card care carp cars cart case cash cast
cats cave cede cell cent chap char chat chef chew chic chin chip chop chow chug
chum cite city clad clam clan clap claw clay clef clip clog clot club clue coal
coat cobs cock coco coda code cods coil coin coke cola cold colt coma comb come
cone cons cook cool coop coot cope cops copy cord core cork corn cost cots coup
cove cowl cows cozy crab crag cram crew crib crop crow crud cube cubs cued cues
cuff cull cult curb curd cure curl curt cusp cuts dabs dads daft dais dale dame
damp dams dank dare dark darn dart dash data date daub dawn days daze dead deaf
deal dean dear debt deck deed deem deep deer deft defy dell demo dens dent deny
desk dial dice died dies diet digs dike dill dime dine ding dins dint dire dirt
disc dish disk diva dive dock docs doer does doff dogs dole doll dolt dome done
dons doom door dope dork dorm dose dote dots dour dove down doze drab drag dram
draw dray drew drip drop drug drum dual dubs duck duct dude duds duel dues duet
duke dull duly dumb dump dune dung dunk duns dupe dusk dust duty dyed dyes each
earl earn ears ease east easy eats ebbs echo eddy edge edgy edit eels eery eggs
egos ekes elks ells elms else emit emus ends envy epic errs euro even ever eves
evil ewes exam exec exes exit expo eyed eyes face fact fade fads fail fair fake
fall fame fang fans fare farm fast fate fats fawn faze fear feat feed feel fees
feet fell felt fend fern feud fibs figs file fill film fils find fine fins fire
firm firs fish fist fits five fizz flag flak flap flat flaw flax flea fled flee
flew flex flip flit floe flog flop flow flub flue flux foal foam foci foes fogs
foil fold folk fond font food fool foot ford fore fork form fort foul four fowl
foxy fray free fret frog from fuel full fume fund funk furl furs fury fuse fuss
fuzz gabs gags gain gait gala gale gall game gang gape gaps garb gash gasp gate
gave gawk gaze gear geek gees gems gene gent germ gets gibe gift gigs gild gill
gilt gins gird girl gist give glad glee glen glib glob glow glue glum glut gnat
gnaw goad goal goat gobs gods goer goes gold golf gone gong good goof gook goon
goop gore gory gosh gout gown grab gram gray grew grey grid grim grin grip grit
grog grow grub gulf gull gulp gums gunk guns guru gush gust guts guys gyms hack
haft hags hail hair hake hale half hall halo halt hams hand hang hank hard hare
hark harm harp hart hash hasp hate hats haul have hawk hays haze hazy head heal
heap hear heat heck heed heel heft heir held hell helm help hemp hens herb herd
here hero hers hewn hews hick hide high hike hill hilt hind hint hips hire hiss
hits hive hoax hobo hock hoed hoes hogs hold hole holy home hone honk hood hoof
hook hoop hoot hope hops horn hose host hour hove howl hows hubs hued hues huff
huge hugs hulk hull hump hums hung hunk hunt hurl hurt hush husk huts hymn hype
ibex ices icky icon idea idle idly idol iffy ilks ills imps inch info inks inky
inns into ions iota ires iris irks iron isle itch item jabs jack jade jail jamb
jams jars java jaws jays jazz jean jeep jeer jell jerk jest jets jibe jibs jigs
jilt jinx jive jobs jock jogs john join joke jolt josh jots jowl joys judo jugs
juke jump junk jury just jute juts kale keel keen keep kegs kelp kept keys kick
kids kill kiln kilo kilt kind king kink kins kiss kite kits kiwi knee knew knit
knob knot know kohl labs lace lack lacy lade lads lady laid lain lair lake lamb
lame lamp land lane laps lard lark lash lass last late lath laud lava lawn laws
lays laze lazy lead leaf leak lean leap left legs lend lens lent less lest lets
levy liar lice lick lids lied lief lien lies life lift like lilt lily limb lime
limn limo limp line link lint lion lips lisp list lite live load loaf loam loan
lobe lobs loci lock loco lode loft logo logs loin loll lone long look loom loon
loop loot lope lops lord lore lose loss lost lots loud lout love lows luck luff
lugs lull lump lung lure lurk lush lust lute lynx lyre mace made mage magi maid
mail maim main make male mall malt mane many maps mare mark marl mars mart mash
mask mass mast mate math mats matt maul maws maze mead meal mean meat meek meet
meld melt memo mend menu meow mere mesa mesh mess mewl mews mica mice mild mile
milk mill mils mime mind mine mini mink mint minx mire miss mist mite mitt moan
moat mobs mock mode mods mold mole molt monk mono mood moon moor moot mope more
morn moss most mote moth move mown mows much muck muds muff mugs mule mull mums
murk muse mush musk must mute mutt myth nabs nags nail name nape naps nary nave
navy nays near neat neck need neon nerd nest nets news newt next nibs nice nick
nigh nine nips node nods noel noes noir none nook noon norm nose nosy note noun
nova nows nubs nude nuke null numb nuns nuts oafs oaks oars oath oats obey oboe
odds odes odor ogle ogre oils oily oink okay okra oleo omen omit once ones only
onto onus onyx ooze oozy opal open opts opus oral orbs ores oval oven over ovum
owed owes owls owns oxen pace pack pact pads page paid pail pain pair pale pall
palm pals pane pang pans pant papa pare park part pass past pate path pats pave
pawn paws pays peak peal pear peas peat peck peed peek peel peep peer pegs pens
pent peon peps perk perm pert peso pest pets pews phew pica pick pics pied pier
pies pigs pike pile pill pimp pine ping pink pins pint pion pips pita pith pits
pity plan play plea pled plod plop plot plow ploy plug plum plus pock pods poem
poet poke poky pole poll polo pols poly pomp pond pony pool poor pope pops pore
pork porn port pose posh post posy pots pour pout pows pray prep prey prig prim
prod prof prom prop pros prow psis pubs puck puff pugs puke pull pulp puma pump
punk puns punt puny pupa pups pure purl purr push puss puts putt pyre quad quay
quid quip quit quiz race rack racy raft rage rags raid rail rain rake ramp rams
rand rang rank rant rape raps rapt rare rash rasp rate rats rave rays raze read
real ream reap rear reck redo reds reed reef reek reel refs rein rely rend rent
reps rest revs rhea ribs rice rich rick ride rife riff rift rigs rile rill rime
rims rind ring rink riot ripe rips rise risk rite road roam roar robe robs ruby
rock rode rods roes roil role roll romp rood roof rook room root rope ropy rose
rosy rote rots rout rove rows rube rubs rude ruff rugs ruin rule rump rums rune
rung runs runt ruse rush rusk rust ruts sack sacs safe saga sage sago sags said
sail sake sale salt same sand sane sang sank sans saps sari sash sass sate save
sawn saws says scab scam scan scar scat scot scow scud scum seal seam sear seas
seat sect seed seek seem seen seep seer sees self sell semi send sent sept sera
serf sets sewn sews shad shag sham shed shim shin ship shod shoe shoo shop shot
show shun shut sick side sift sigh sign silk sill silo silt sing sink sins sips
sire sirs site sits size skew skid skim skin skip skis skit slab slag slam slap
slat slaw slay sled slew slid slim slip slit slob sloe slog slop slot slow slug
slum slur slut smog smug smut snag snap snip snit snob snot snow snub snug soak
soap soar sobs sock soda sods sofa soft soil sold sole solo sols some song sons
soon soot sops sore sort soul soup sour sown sows soya spam span spar spas spat
spec sped spew spin spit spot spry spud spun spur stab stag star stat stay stem
step stew stir stop stow stub stud stun stye subs such suck suds sued sues suet
suit sulk sumo sump sums sung sunk suns sups sure surf swab swag swam swan swap
swat sway swig swim swop swot sync tabs tach tack taco tact tads tags tail take
tale talk tall tame tamp tang tank tans tape taps tare tarn taro tarp tars tart
task tats taut taxi teak teal team tear teas teat tech teds teed teem teen tees
tell temp tend tens tent term tern test text than that thaw thee them then thew
they thin this thou thud thug thus tick tics tide tidy tied tier ties tiff tike
tile till tilt time tine ting tins tint tiny tips tire toad toed toes tofu toga
togs toil toke told toll tomb tome toms tone tong tons took tool toot tope tops
tore torn tors tort toss tote tots tour tout town toys tram trap tray tree trek
trim trio trip trod trot troy true tsar tuba tube tubs tuck tuft tugs tuna tune
turf turn tusk tutu twee twig twin twit tyke type typo tyre ugly ulna undo unit
unto upon urea urge urns used user uses vain vale vamp vane vans vary vase vast
vats veal veer veil vein vend vent verb very vest veto vets vial vice vids vied
vies view vile vine viol visa vise viva void vole volt vote vows wade wadi wads
waft wage wags waif wail wait wake wale walk wall wand wane want ward ware warm
warn warp wars wart wary wash wasp watt wave wavy waxy ways weak weal wean wear
webs weds weed week weep weft weir weld well welt wend went wept were west wets
wham what when whet whew whey whim whip whir whit whiz whoa whom whop wick wide
wife wigs wild wile will wilt wily wimp wind wine wing wink wino wins wipe wire
wiry wise wish wisp with wits wive woes woke wold wolf womb wont wood woof wool
woos word wore work worm worn wort wove wows wrap wren writ yaks yams yang yank
yaps yard yarn yawn year yeas yell yelp yews yips yoga yoke yolk yond yore your
yowl yuan yuck yule yurt zags zany zaps zeal zero zest zeta zinc zing zips zone
zoom zoos
`;

const FIVE = `
abide abode about above abuse acorn acrid actor acute adapt admit adobe adopt
adore adult affix afire afoot after again agape agate agent agile aglow aided
aisle alarm album alert algae alias alibi alien align alike alive alley allot
allow alloy aloft alone along aloof aloud alpha altar alter amass amaze amber
amble amend amino amiss among ample amply amuse angel anger angle angry angst
ankle annex annoy antic anvil aorta apart aphid apple apply apron aptly arena
argue arise armor aroma arose array arrow arson ascot ashen aside asked asset
atlas atoll atone attic audio audit augur aunts aunty aura autos avail avert
avoid await awake award aware awash awful awoke axiom azure bacon badge badly
bagel baggy baker balmy banal bands banjo barge baron basal based bases basic
basil basin basis baste bathe baton bayou beach beads beady beams beans beard
beast beats began beget begin begun beige being belie belle belly below bench
bends beret berry berth bevel bible bicep bidet bigot bijou biked biker bilge
binge bingo biome birch birds birth bison biter bites black blade blame bland
blank blare blast blaze bleak bleat bleed bleep blend bless blimp blind bling
blink bliss blitz bloat block bloke blond blood bloom blots blown blows bluer
blues bluff blunt blurb blurs blurt blush board boast boats bobby boded bogey
boggy bogus boils bongo bonus booby books booms boost booth boots booty booze
borax bored borer bosom bossy botch bough bound bowel bower bowls boxer boxes
brace braid brain brake brand brash brass brave bravo brawl brawn bread break
bream breed briar bribe brick bride brief brine bring brink briny brisk broad
broil broke brood brook broom broth brown brows bruin brunt brush brute buddy
budge buggy bugle build built bulge bulks bulky bully bumpy bunch bunny burly
burns burnt burps burro burst bushy busts butch butte buxom buyer bylaw cabin
cable cacao cache cadet cafes caged cages cagey cairn caked cakes calif calls
camel cameo camps canal candy caned canes canoe canon caper capes capon carat
cards cared cares cargo carol carve cased cases caste catch cater catty cause
caved caves cavil cease cedar cells cello cents chafe chaff chain chair chalk
champ chant chaos chaps charm chart chase chasm cheap cheat check cheek cheep
cheer chess chest chick chide chief child chile chili chill chime chimp china
chink chino chins chirp chive chock choir choke chomp chops chord chore chose
chuck chugs chump chunk churn chute cider cigar cinch circa cited cites civet
civic civil clack claim clamp clams clang clank claps clash clasp class claws
clean clear cleat clefs cleft clerk click cliff climb clime cling clink clips
cloak clock clods clogs clomp clone close cloth cloud clout clove clown cloys
clubs cluck clued clues clump clung clunk coach coals coast coats cobra cocoa
cocks cocky codes codex coils coins colas colds colic colon color colts coma
combo combs comer comes comet comfy comic comma condo cones conic cooed cooks
cools coops copra copse coral cords cored cores corks corky corns corny corps
costs couch cough could count coupe court coven cover coves covet covey cowed
cower cowls coyly crabs crack craft crags cramp crane crank crape craps crash
crass crate crave crawl craze crazy creak cream credo creed creek creel creep
crepe crept cress crest crews cribs crick cried crier cries crime crimp crisp
croak crock crone crony crook croon crops cross croup crowd crown crows crude
cruel cruet crumb crush crust crypt cubby cubed cubes cubic cuddy cued cuffs
cuing culls cults cumin cupid curbs curds cured curer cures curie curio curls
curly curry curse curst curve curvy cushy cusps cutie cycle cynic daddy daffy
daily dairy daisy dally dance dandy dared dares darns darts dated dates datum
daunt dawns dazed deals dealt deans dears death debit debts debug debut decal
decay decks decor decoy decry deeds deems deeps defer defog deign deity delay
delta delve demon demos demur denim dense dents depth derby desks deter detox
devil dials diary diced dicer dices dicey digit dikes dills dimer dimes dined
diner dines dingo dingy dinky diode dirge dirty disco discs ditch ditsy ditty
divan dived diver dives divot dizzy docks dodge dodgy doers doggy dogma doily
doing doled doles dolls dolly domed domes donor donut dooms doors dopey dorks
dorky dorms dosed doses doted dotes doubt dough dowdy dowel dower downs dowry
dowse dozed dozen dozes draft drags drain drake drama drank drape drawl drawn
draws dread dream dregs dress dried drier dries drift drill drily drink drips
drive droid droll drone drool droop drops dross drove drown drubs drugs drums
drunk dryad dryer dryly ducal ducat duchy ducks ducky duels duets duffs dukes
dulls dully dummy dumps dumpy dunce dunes dungs dunks duped dupes dusky dusts
dusty duvet dwarf dwell dwelt dyers dying eager eagle eared earls early earns
earth eased easel eases eaten eater eaves ebony edema edged edger edges edict
edify edits eerie egret eight eject eking elate elbow elder elect elegy elfin
elide elite elope elude elves email embed ember emcee emend emery emirs emits
emote empty enact ended endow enema enemy enjoy ennui enrol ensue enter entry
envoy epees epoch epoxy equal equip erase erect erode erred error erupt essay
ester ether ethic ethos evade evens event every evict evils evoke exact exalt
exams excel exert exile exist expel extol extra exude exult fable faced faces
facet facts faded fades faery fails faint fairs fairy faith faked faker fakes
falls false famed fancy fangs fanny farce fared fares farms fasts fatal fated
fates fatty fault fauna favor fawns faxed faxes fazed fazes fears feast feats
fecal fecal feign feint fella felon felts femur fence fends feral ferns ferry
fetal fetch feted fetes fetid fetus feuds fever fewer fiber fiche field fiend
fiery fifes fifth fifty fight filch filed filer files filet fills filly films
filmy final finch finds fined finer fines finis finks finny fiord fired fires
firms first firth fishy fists fitly fiver fives fixed fixer fixes fizzy fjord
flabs flack flags flail flair flake flaky flame flank flaps flare flash flask
flats flaws flays fleas fleck flees fleet flesh flick flied flier flies fling
flint flips flirt flits float flock floes flogs flood floor flops flora floss
flour flout flown flows flubs flue fluff fluid fluke fluky flume flung flunk
flush flute flyby flyer foals foamy focal focus fogey foggy foils foist folds
folio folks folly fonts foods fools foots foray force fords forge forgo forks
forte forth forts forty forum fouls found fount fours fowls foxes foyer frail
frame franc frank fraud frays freak freed frees fresh frets friar fried fries
frill frisk frizz frock frogs frond front frost froth frown froze fruit frump
fryer fudge fuels fugue fully fumed fumes funds fungi funks funky funny furls
furor furry fused fuses fussy fusty futon fuzzy gabby gable gaffe gaged gages
gaily gains gaits galas gales galls gamed gamer games gamey gamma gamut gangs
gaped gapes gases gasps gassy gated gates gaudy gauge gaunt gauze gauzy gavel
gawks gawky gayer gayly gazed gazer gazes gears gecko geeks geeky geese genes
genie genre gents genus geode germs getup ghoul giant giddy gifts gilds gills
gilts gimpy girds girls girth gists given giver gives gizmo glade gland glare
glass glaze gleam glean glens glide glint glitz gloat globe globs gloom glory
gloss glove glows glued glues gluey gluts gnarl gnash gnats gnome goads goals
goats godly goers going golds golfs golly gonad gongs goods goody gooey goofs
goofy goons goony goopy goose gored gores gorge gorse gouge gourd gowns grabs
grace grade grads graft grail grain grams grand grant grape graph grasp grass
grate grave gravy graze great grebe greed green greet greys gride grief grill
grime grimy grind grins gripe grips grist grits groan groin groom grope gross
group grout grove growl grown grows grubs gruel gruff grump grunt guano guard
guava guess guest guide guild guile guilt guise gulch gulfs gulls gully gulps
gumbo gummy guppy gurus gushy gusto gusts gusty gutsy gutty guyed gypsy habit
hacks hafts haiku hairs hairy haled haler hales halls halos halts halve hands
handy hangs hanky happy hardy hared harem hares harks harms harps harpy harry
harsh haste hasty hatch hated hater hates hauls haunt haven haver haves havoc
hawks hazed hazel hazes heads heady heals heaps heard hears heart heath heave
heavy hedge hefts hefty heirs heist helix hello hells helms helps hemps hence
herbs herds heron hertz hewed hewer hexed hexes hicks hided hides highs hiked
hiker hikes hilly hilts hinds hinge hints hippo hippy hired hirer hires hitch
hived hives hoard hoary hobby hobos hocks hoist hokey holds holes holey holly
homed homer homes homey honed honer hones honey honks honor hooch hoods hoofs
hooks hooky hoops hoots hoped hoper hopes horde horns horny horse hoses hosts
hotel hound hours house hovel hover howdy howls hubby huffs huffy hulks hulls
human humid humor humps humus hunch hunks hunts hurls hurry hurts husks husky
hussy hutch hydra hyena hymns hyped hyper hypes ideal ideas idiom idiot idled
idler idles idols igloo iliac image imams imbue impel imply inane inapt incur
index indie inept inert infer infix ingot inked inlay inlet inner input inset
inter intro inure irate irked irons irony islet issue itchy items ivied ivies
ivory jabot jacks jaded jades jails jambs jaunt jawed jazzy jeans jeers jeeps
jelly jerks jerky jetty jewel jiffy jilts jimmy jingo jinks joins joint joist
joked joker jokes jolly jolts joule joust jowls joyed judge juice juicy jumbo
jumps jumpy junco junks junky junta juror kabob kaput karat karma kayak kebab
keels keens keeps kelps kempt kendo keyed khaki kicks kiddo kills kilns kilos
kilts kinds kings kinks kinky kiosk kites kitty kiwis klutz knack knave knead
kneed kneel knees knell knelt knife knits knobs knock knoll knots known knows
koala kudos kudzu label labor laced laces lacks laded laden lades ladle lager
laird laity lakes lamas lambs lamed lamer lamps lance lands lanes lanky lapel
lapse larch lards large largo larks larva laser lasso lasts latch later latex
lathe laths latte laugh lauds laved laver lawns laxer layer leach leads leafy
leaks leaky leans leant leaps leapt learn lease leash least leave ledge leech
leeks leers leery lefts lefty legal leggy lemma lemon lemur lends leper letup
levee level lever liars libel licit liege liens light liked liken liker likes
lilac lilts limbo limbs limed limes limit limns limos limps lined linen liner
lines lingo links lints linty lions lipid liras lisle lisps lists liter lithe
lived liven liver lives livid llama loach loads loafs loamy loans loath lobar
lobby lobed lobes local locks locus lodge lofts lofty logic loins lolls loner
longs looby looks looms loons loony loops loopy loose loots loped lopes lords
lorry loser loses lotus louse lousy louts loved lover loves lowed lower lowly
loyal lubed lucid lucks lucky lulls lumen lumps lumpy lunar lunch lunge lupus
lurch lured lures lurid lurks lusts lusty lutes lying lymph lyres lyric maced
maces macho macro madam madly mafia magic magma maids mails maims mains maize
major maker makes males malls malts mamas mamba mambo mamma maned manes mange
mango mangy mania manic manly manna manor manse maple march mares marks marry
marsh marts masks mason masts match mated mates matte mauls mauve maven maxim
maybe mayor mazes meads meals mealy means meant meats meaty mecca medal media
medic meets melds melee melon melts memos mends menus meows mercy merge merit
merry mesas messy metal meted meter metes metro mewed mewls mezzo micas micro
midge midst miens miffs might miked mikes miler miles milks milky mills mimed
mimes mimic mince minds mined miner mines mingy minim minks minor mints minty
minus mired mires mirth miser missy mists misty miter mites mitts mixed mixer
mixes moans moats mocha mocks modal model modem modes moist molar molds moldy
moles molls molts money monks month mooch moods moody mooed moons moony moors
moose moots moped moper mopes moral moras morel mores moron morph mosey moss
motel motes moths motif motor motto mould mound mount mourn mouse mousy mouth
moved mover moves movie mowed mower mucus muddy muffs muggy mulch mules mulls
mummy mumps munch mural murks murky mused muser muses mushy music musks musky
mussy musts musty muted muter mutes mutts mynah myrrh myths nabla nacho nadir
naiad nails naive naked named names nanny napes nappy narcs nasal nasty natal
natty naval navel naves nazis neaps nears necks needs needy neigh nerds nerdy
nerve nervy nests never newer newly newts nexus nicer niche nicks niece nifty
night nills nimbi ninja ninth nippy niter nixed nixes noble nobly nodal nodes
noels noise noisy nomad nooks noons noose norms north nosed noses nosey notch
noted notes nouns novae novas novel noway nudes nudge nuked nukes nulls numbs
nurse nutty nylon nymph oaken oakum oared oases oasis oaten oaths obese obeys
oboes occur ocean ocher octal octet odder oddly odium odors offal offed offer
often ogled ogler ogles ogres oiled oinks okapi okays olden older oldie olive
omega omens onion onset oomph oozed oozes opals opens opera opine opium opted
optic orals orang orate orbit order organ oriel osier ought ounce ousts outdo
outed outer outgo ovals ovary ovate ovens overs overt ovoid ovule owing owlet
owned owner oxbow oxide ozone paced pacer paces packs pacts paddy paean pagan
paged pager pages pails pains paint pairs paled paler pales palls palms palmy
palsy panda paned panel panes pangs panic pansy pants papal papas paper parch
pared pares parka parks parry parse parts party passe pasta paste pasty patch
paten pater pates paths patio patsy patty pause paved paver paves pawed pawns
payed payee payer peace peach peaks peaky peals pearl pears peats pecan pecks
pedal peeks peels peeps peers peeve pekoe pelts penal pence penes penis penne
penny peons peony peppy perch peril perks perky perms pesky pesos pests petal
peter petit petty pewee phase phial phlox phone phony photo phyla piano picas
picks picky piece piers piety piggy pigmy piked piker pikes pilaf piled piles
pills pilot pimps pinch pined pines piney pings pinko pinks pinky pinto pints
piped piper pipes pipit pique pitch piths pithy piton pivot pixel pixie pizza
place plaid plain plait plane plank plans plant plash plate plays plaza plead
pleas pleat plebe plied plier plies plink plods plonk plops plots plows ploys
pluck plugs plumb plume plump plums plunk plush poach pocks poems poesy poets
point poise poked poker pokes pokey polar poled poles polio polka polls polyp
ponds pones pooch poohs pools poops popes poppy porch pored pores porgy porks
ports posed poser poses posit posse posts potty pouch poufs poult pound pours
pouts power poxes prams prank prate prawn prays preen preps press preys price
prick pride pried prier pries prigs prima prime primo primp prims print prior
prism privy prize probe prods proem profs promo proms prone prong proof props
prose prosy proud prove prowl proxy prude prune psalm pshaw pubes pubic pucks
pudgy puffs puffy puked pukes pulls pulps pulpy pulse pumas pumps punch punks
punky punts pupae pupas pupil puppy puree purer purge purls purrs purse pushy
pussy putts putty pygmy pylon pyres quack quads quaff quail quake qualm quark
quart quash quasi quays queen queer quell query quest queue quick quiet quill
quilt quins quips quire quirk quirt quite quits quota quote rabbi rabid raced
racer races racks radar radii radio radon rafts raged rages raids rails rains
rainy raise rajah raked rakes rally ramen ramps ranch randy range rangy ranks
rants raped raper rapes rapid rared rarer raspy rated rates ratio ratty raved
ravel raven raver raves razed razes razor reach react reads ready realm reals
reams reaps rearm rears rebar rebel rebid rebus rebut recap recon recta recur
recut redox redye reeds reedy reefs reeks reeky reels refer refit regal rehab
reign reins relax relay relit remit renal rends renew rents repay repel reply
repos reran reset resin rests retch retro retry reuse revel revue rewed rheas
rhino rhyme rials riced ricer rices ricks rider rides ridge rifle rifts right
rigid rigor riled riles rills rimed rimes rinds rings rinks rinse riots ripen
riper risen riser rises risks risky rites ritzy rival riven river rivet roach
roads roams roans roars roast robed robes robin robot rocks rocky rodeo roger
rogue roils roily roled roles rolls roman romps roods roofs rooks rooms roomy
roost roots ropes roped rosin roses rotor rouge rough round rouse route routs
roved rover roves rowan rowdy rowed rowel rower royal ruble ruche ruddy ruder
ruffs rugby ruing ruins ruled ruler rules rumba rummy rumor rumps runes rungs
runny runts runty rupee rural ruses rusks rusts rusty saber sable sacks sadly
safer safes sagas sages sahib sails saint sakes salad sales sally salon salsa
salts salty salve salvo samba sands sandy sappy sarge saris sassy satay sated
sates satin satyr sauce saucy sauna saved saver saves savor savoy savvy sawed
scabs scads scald scale scalp scaly scamp scams scans scant scape scare scarf
scars scary scats scene scent schwa scion scoff scold scone scoop scoot scope
score scorn scots scour scout scowl scrag scram scrap screw scrim scrip scrod
scrub scrum scuba scuds scuff scull sculp scums scurf seals seams seamy sears
seats sects sedan seder seeds seedy seeks seems seeps seers segue seine seize
sells semen sends sense sepal serfs serge serif serum serve setup seven sever
sewed sewer shack shade shady shaft shags shake shaky shale shall shalt shame
shams shank shape shard share shark sharp shave shawl sheaf shear sheds sheen
sheep sheer sheet sheik shelf shell shied shies shift shill shine shiny ships
shire shirk shirt shive shoal shock shoed shoes shone shook shoot shops shore
shorn short shots shout shove shown shows showy shred shrew shrub shrug shuck
shuns shunt shush shute shyer shyly sials sibyl sicks sided sides sidle siege
sieve sifts sighs sight sigma signs silks silky sills silly silos silts silty
since sines sinew singe sings sinks sinus sired siren sires sisal sissy sitar
sited sites sixes sixth sixty sized sizer sizes skate skeet skein skids skied
skier skies skiff skill skimp skims skins skips skirt skits skulk skull skunk
slabs slack slags slain slake slams slang slant slaps slash slate slats slave
slaws slays sleds sleek sleep sleet slept slice slick slide slily slime slims
slimy sling slink slips slits slobs sloes slogs sloop slops slosh sloth slots
slows slugs slump slums slung slunk slurp slurs slush sluts slyer slyly smack
small smart smash smear smell smelt smile smirk smite smith smock smogs smoke
smoky snack snafu snags snail snake snaky snaps snare snarl sneak sneer snick
snide sniff snipe snips snits snobs snoop snoot snore snort snots snout snows
snowy snubs snuck snuff snugs soaks soaps soapy soars sober socks sodas sofas
softy soggy soils solar soled soles solid solos solve sonar songs sonic sonny
sooth soots sooty soppy sores sorry sorta sorts souls sound soups soupy sours
souse south sowed sower space spacy spade spake spank spans spare spark spars
spasm spate spats spawn spays speak spear speck specs speed spell spelt spend
spent sperm spews spice spicy spied spiel spies spike spiky spill spilt spine
spins spiny spire spite spits splat splay split spoil spoke spoof spook spool
spoon spoor spore sport spots spout sprat spray spree sprig spuds spume spunk
spurn spurs spurt sputa squab squad squat squaw squib squid stabs stack staff
stage staid stain stair stake stale stalk stall stamp stand stank staph stare
stark stars start stash state stats stave stays stead steak steal steam steed
steel steep steer stein stems steno steps stern stews stick stied sties stiff
stile still stilt sting stink stint stirs stoat stock stoic stoke stole stomp
stone stony stood stool stoop stops store stork storm story stout stove stows
strap straw stray strep strew strip strop strum strut stubs stuck studs study
stuff stump stums stung stunk stuns stunt stupa styes styli suave sucks sudsy
suede suety sugar suing suite suits sulfa sulks sulky sully sumac summa sumps
sunny sunup super surer surfs surge surly sushi swabs swags swain swami swamp
swank swans swaps sward swarm swash swath swats sways swear sweat swede sweep
sweet swell swept swift swigs swill swims swine swing swipe swirl swish swoon
swoop swops sword swore sworn swung sylph synch syncs synod syrup tabby table
taboo tabor tacit tacks tacky tacos taffy tails taint taken taker takes tales
talks tally talon tamed tamer tames tamps tango tangy tanks tansy taped taper
tapes tapir tardy tared tares tarns taros tarot tarps tarry tarts taser tasks
taste tasty tatty taunt taupe tawny taxed taxer taxes taxis teach teaks teals
teams tears teary tease teats techs teddy teems teens teeny teeth tells tempo
temps tempt tench tends tenet tenon tenor tense tenth tents tepee tepid terms
terns terra terse tests testy tetra texts thank thaws theft their theme there
therm these theta thick thief thigh thine thing think thins third thong thorn
those three threw throb throe throw thrum thuds thugs thumb thump thyme tiara
ticks tidal tided tides tiers tiffs tiger tight tikes tikis tilde tiled tiler
tiles tills tilts timed timer times timid tinct tined tines tinge tings tinny
tints tipsy tired tires tiros titan tithe title toads toady toast today toddy
toffy tofus togas toils toked token tokes tolls tombs tomes tommy tonal toned
toner tones tongs tonic tonne tools tooth toots topaz topic toque torch torso
torts torus total toted totem totes touch tough tours touts towed towel tower
towns toxic toxin toyed trace track tract trade trail train trait tramp trams
traps trash trawl trays tread treat treed trees treks trend tress triad trial
tribe trice trick tried trier tries trill trims trine trios tripe trips trite
troll tromp troop trope troth trots trout trove truce truck truer truly trump
trunk truss trust truth tryst tsars tubae tubal tubby tubed tuber tubes tucks
tufas tufts tulip tulle tumor tunas tuned tuner tunes tunic turbo turfs turns
tusks tutor tutus tuxes twain twang tweak tweed tween tweet twerp twice twigs
twill twine twins twiny twirl twist twits tying tykes typal typed types typos
tyros udder ukase ulcer ulnae ulnar ultra umbel umber umbra umiak unbar uncle
uncut under undid undue unfed unfit unify union unite units unity unlit unmet
unpin unsay unset untie until unwed unzip upend upper upset urban urged urger
urges urine usage users usher using usual usurp usury uteri utile utter uvula
vague vales valet valid valor value valve vamps vanes vapid vapor vaunt veals
veena veers vegan veils veins velar velds venal vends venom vents venue verbs
verge verse verso verve vests vetch veto vexed vexes vials viand vibes vicar
vices video views vigil vigor viler villa vinca vined vines vinyl viola viols
viper viral vireo virus visas vised vises visit visor vista vital vivas vixen
vizir vocab vodka vogue voice voids voila voles volts vomit voted voter votes
vouch vowed vowel vower vroom vulva wacko wacky waded wader wades wadis wafer
wafts waged wager wages waifs wails waist waits waive waked waken wakes waled
wales walks walls waltz wands waned wanes wanly wanna wants wards wares warns
warps warts warty washy wasps waste watch water watts waved waver waves waxed
waxen waxes weald weals weans wears weary weave webby wedge weeds weedy weeks
weeny weeps weepy wefts weigh weird weirs welch welds wells welsh welts wench
wends wetly whack whale whams wharf wheat wheel whelk whelp where which whiff
while whims whine whiny whips whirl whirr whirs whisk whist white whits whity
whizz whole whoop whops whore whorl whose wicks widen wider widow width wield
wifes wight wilds wiles wills wilts wimps wimpy wince winch winds windy wined
wines wings winks winos wiped wiper wipes wired wires wised wiser wises wisps
wispy witch withe wived wives wizen woken wolds woman wombs women wonks wonky
woods woody wooed wooer woofs wools wooly woozy words wordy works world worms
wormy worry worse worst worth would wound woven wowed wrack wraps wrath wreak
wreck wrens wrest wrier wring wrist write writs wrong wrote wroth wrung wryly
xenon xylem yacht yahoo yamen yanks yards yarns yawed yawls yawns yeahs yearn
years yeast yells yelps yeses yield yipes yodel yogas yogic yogis yoked yokel
yokes yolks young yours youth yowls yucca yucky yules yummy yurts zappy zeals
zebra zebus zeros zests zesty zetas zilch zincs zings zingy zippy zonal zoned
zoner zones zonks zooid zooms zowie
`;

const SIX_SEVEN = `
absorb accept accuse across acting action active actual advice advise afford
agenda almost always amount animal answer anthem anyone anyway appeal appear
around arrest arrive artist aspect assign assist assume asthma attach attack
attend august author autumn avenue baboon bakery ballet ballot banana bandit
banker basket batter beacon beauty beaver became become before behalf behave
behind belief belong beside better beyond bishop bitter blazer blonde bloody
bottle bottom bought bounce bounty branch brandy breach breath breeze bridge
bright bronze brooch bucket budget bumper bundle burden bureau burrow butter
button camera cancel candle canvas canyon carbon career carpet carrot cartel
carton casino castle casual cattle caught cavity cellar cement cereal chance
change chaos charge cheese cherry chorus chosen church cinema circle clause
clever client climax clinic closer closet coffee collar colony combat comedy
coming common cookie cooler copper corner cotton county couple course cousin
coward cradle crayon cream create credit crisis critic crunch crutch crypto
cubism cuddle cuisine cursor curtain custom damage danger dealer decade decide
decode defeat defend define degree demand depart depend deploy deposit desert
design desire detail detect device devote differ dinner dining direct divide
divine doctor dollar domain donate double dragon drawer driven driver during
easily eagle earned eaten editor effect effort eighty either eleven emerge
empire employ enable ending energy engage engine enough ensure entire entrap
equity errand escape estate ethnic exceed except excess excite excuse expand
expect expert expose extend fabric factor fairly fallen family famous farmer
faster father fasten feable feared fellow female figure filter finger finish
firmly flavor flight flower fluent flying follow forbid forest forget formal
format former fossil foster fought fourth freeze french friend fringe frozen
future gadget galaxy garage garden garlic gather gender genius gentle ginger
glossy golden govern grades grades grand granny gravel greasy greedy ground
grower growth guilty guitar gutter hallow hamlet hammer handle happen harbor
hardly hazard header health heaven height hidden hollow honest honter hornet
horror hostel hotels humble hunger hungry hunter hybrid iceberg impact import
impose income indeed indoor infant inform injure injury inmate insect inside
insist intact intake intend invade invent invest invite island itself jacket
jaguar jockey jumper jungle junior kernel kidney kindle kitten kitchen ladder
lately latter launch lawyer leader league legacy legend length lesson letter
likely linear linger liquid listen little lively loudly lounge lovely lucky
luxury madame magnet mainly makeup manage manner mantle marble margin marine
market martyr mascot master matrix matter mayhem meadow medium melody memory
mentor merger method middle mighty mildly minute mirror misery mobile modern
modest modify moment monkey mortal mother motion motive murder muscle museum
mutual myself narrow nation native nature nearby nearly needle nephew nickel
nicely nights noodle notice notion number object oblige obtain occupy office
online oppose orange orbit ordeal orphan output oxygen packet palace panels
parade parcel parent parish parrot partly patent patrol pattern paused pencil
pepper period permit person phrase picnic pillar pillow pilots pistol planet
plants plaque plasma plated player please plenty plunge pocket poetry poison
police policy polish portal potato pouch powder praise prayer prefer pretty
prince prison profit prompt proper proven public punish purple pursue puzzle
quaint quarry quarter quench quiver rabbit racism racket radar radish random
rarely rather rattle reader really reason rebel recall recent recipe reckon
record reduce reform refuse regard regime region reject relate relax relief
remain remark remedy remind remote remove render rental repair repeat replay
report rescue resign resist resort result retail retain retire return reveal
review reward richly ridden rocket rotate rubber rugged runner rustic saddle
safety salary salmon sample sanity savage saving saying scarce scenic school
scrape scream screen script search season second secret sector secure select
seldom senior sensor serial series server settle severe sewage shadow shaft
shaken shanty shield should shrimp shrink shrine sight signal silent silver
simple simply single sister sketch slight slogan smooth soccer social sodium
softly sought source sphere spider spinal spiral spirit splash spleen sponge
spouse spread spring sprint square squash squeak squire stable stairs status
steady stereo sticky stitch stolen strain strand strange strap streak stream
street stress strict strike string strive strong studio stupid submit subtle
suburb subway sudden suffer summer summit sunset supper supply surely survey
switch symbol syntax syrup system tablet tackle talent target tattoo teapot
temple tenant tender tennis theory thirst thirty thread threat thrive throat
throne thrown ticket timber timely timing tissue toilet tomato tongue toward
travel treaty trench triple trophy tropic trough trying tunnel turkey twelve
twenty twinkle typing unable unfair unfold unique unless unlike unlock unpack
untold unveil unwrap update uphold upload uproar upside upward useful vacant
valley vanish various vector velvet vendor verbal verify vessel victim victor
viewer virtue vision visual volume voyage waffle waited walnut wander warmth
washer wealth weapon weekly weight window winner winter wisdom within wonder
wooden worker writer wrote yellow yogurt zigzag zombie
account amazing analyst ancient another anxiety anybody anytime applied approve
attempt attract auction average balance banking barrier battery bedroom benefit
between billion binding blanket blessed blister brother buffalo builder built
cabinet caliber capital captain caption capture careful carrier ceiling central
century certain chamber channel chapter charity charter cheddar chicken chimney
citizen classic climate closely closure cluster collect college combine comfort
command comment company compare compete compile complex compose compute concept
concern concert conduct confess confirm conquer consent consist contact contain
content contest context control convert cooking correct costume cottage council
counsel counter country courage crackle crimson crucial crumble crusade crystal
culture curious current cushion custody cutting cyclone dancing dazzled decline
default defense deliver dentist deposit deputy descent deserve desktop despair
despite dessert destiny develop diamond diploma display distant diverse dolphin
dormant dossier drastic drawing dreamer driving dungeon dynamic eastern economy
elderly element elevate emperor enclose endless engaged enhance enquire episode
equator eternal evening exactly examine example excited exclude execute exhaust
exhibit explain explore express extreme factory faculty failure fantasy fashion
feather feature federal feeling fiction fifteen finally finance finding fingers
fishing fitness fixture flavour flowing forever formula fortune forward founder
freedom freight frequent fresher gallery gateway gazette general genuine gesture
gigabyte glacier glimmer glisten grammar granite graphic gravity greater grocery
gymnast habitat hallway hamster harmony harvest heading healthy hearing heavily
helpful herbage heretic highway history holiday holster hostage housing however
hundred husband hydrant illness imagine impress improve include initial inquiry
inspire install instead intense intents interim invalid invoice involve isolate
janitor jealous journal journey justice justify keeper keyboard kitchen kingdom
lantern largely leather lecture leftover legend liberty library lighter limited
lobster located logical loyalty machine magical magnify mailbox mammoth mansion
marble mariner massive maximum meaning measure medical meeting mention message
migrant mineral minimal minimum mission mistake mixture monarch monster monthly
morning mystery natural neither network neutral nitrogen nominal nothing nowhere
nuclear nurture obscure observe obvious offense officer offline operate opinion
optimal orchard organic outcome outdoor outfit outlaw outline outlook outpost
overall overdue package painful painter parking partner passage passion patient
pattern payment penalty pending pension percent perfect perform perfume perhaps
picture pioneer plastic platform plateau pleased plumber pointer popcorn portion
poverty powered precise predict premier premium prepare present presume prevent
primary printer privacy problem proceed process produce product profile program
project promise promote propose protect protein protest proudly provide publish
pumpkin pursuit pyramid quality quarrel quarter quicken quickly rabbits radiant
rainbow readily reality realize receipt receive recover recruit reflect refresh
refugee regular related release remains reptile request require rescued reserve
resolve respect respond restore reunion revenue reverse rewrite routine royalty
running rupture satisfy scanner scarlet science scoring scratch section segment
seldom senator serpent servant service session setting seventh several shatter
shelter shorten shortly shoulder shrimp signify silence similar sixteen skeptic
slender slipper slogans society soldier soprano special species specify spectrum
speech spelled spinner sponsor sprayer sprint stadium standby station statute
stellar stencil sternly storage strange stretch student subject subside succeed
success suggest summary sunrise sunshine support suppose supreme surface surgeon
suspect suspend sustain swallow swiftly symptom syringe systems teacher teenage
tension teddy termite terrace terrain terrify texture theater theatre theorem
therapy thereby thicket thinker thirsty thought thunder tobacco tonight toolkit
topical torrent tourism towards tractor traffic tragedy trailer trainer transit
travels treated tribute trigger trolley trooper trouble trucker trumpet trustee
tsunami tuition tunnels typical undergo uniform unravel upgrade upright useless
utility utopian vacancy vaccine variant variety vehicle venture verdict version
veteran victory village vintage violent violet virtual visible visitor vitamin
volcano voltage voucher voyager waiting warfare warmest warning warrior wealthy
weather webpage webinar weekend welcome welfare western whereas whether whiskey
whisper without witness workout worried worship wrestle wrinkle writing written
yearned zealous zeppelin
`;

// Compact strings → clean array. The engine does the length/charset filtering,
// so a stray misspelling or wrong length simply gets dropped rather than
// breaking a puzzle.
const RAW = [THREE, FOUR, FIVE, SIX_SEVEN].join(" ");

export const WORD_LIST = RAW
  .toLowerCase()
  .split(/\s+/)
  .filter(Boolean);
