// Inhalte des Generators: Stile, Namen, Völker, Klassen, Fähigkeiten, Seltenheiten, Lore.
// Geschlechtsformen stehen als [männlich, weiblich]; ein einzelner String gilt für beide.
// Platzhalter in Texten: {name}, {vorname}, {klasse}, {volk}, {ort}, {feind}, {artefakt}, {n}, {d} (der/die),
// {er}/{Er}, {sein}/{seine}/{seinen}/{seinem}/{seiner}, {ihn}, {ihm}, {in} (Endung -in bei weiblich).
var DF_DATA = (function () {

  var RARITIES = [
    { id: 'common', name: 'Gewöhnlich', chance: 46, color: '#a8a29e', points: 60, level: [1, 8], abilities: 2, maxStat: 16 },
    { id: 'rare', name: 'Selten', chance: 28, color: '#60a5fa', points: 66, level: [6, 18], abilities: 3, maxStat: 18 },
    { id: 'epic', name: 'Episch', chance: 16, color: '#c084fc', points: 72, level: [15, 30], abilities: 3, maxStat: 19, ultimate: true },
    { id: 'legendary', name: 'Legendär', chance: 8, color: '#fbbf24', points: 80, level: [28, 45], abilities: 4, maxStat: 21, ultimate: true },
    { id: 'mythic', name: 'Mythisch', chance: 2, color: '#f43f5e', points: 90, level: [45, 60], abilities: 4, maxStat: 24, ultimate: true, gift: true }
  ];

  var STATS = [
    { id: 'str', name: 'Stärke', short: 'STR' },
    { id: 'dex', name: 'Geschick', short: 'GES' },
    { id: 'con', name: 'Konstitution', short: 'KON' },
    { id: 'int', name: 'Intelligenz', short: 'INT' },
    { id: 'wis', name: 'Weisheit', short: 'WEI' },
    { id: 'cha', name: 'Charisma', short: 'CHA' }
  ];

  var ALIGNMENTS = ['Rechtschaffen gut', 'Neutral gut', 'Chaotisch gut', 'Rechtschaffen neutral', 'Wahrhaft neutral',
    'Chaotisch neutral', 'Rechtschaffen böse', 'Neutral böse', 'Chaotisch böse'];

  // Archetypen bestimmen Fähigkeiten, Hauptattribute und das Symbol im Siegel
  var ARCHETYPES = {
    martial: { name: 'Kampf', stats: ['str', 'con', 'dex'], icon: 'sword' },
    arcane: { name: 'Arkan', stats: ['int', 'wis', 'cha'], icon: 'star' },
    shadow: { name: 'Schatten', stats: ['dex', 'int', 'cha'], icon: 'moon' },
    holy: { name: 'Licht', stats: ['wis', 'cha', 'con'], icon: 'sun' },
    nature: { name: 'Natur', stats: ['wis', 'dex', 'con'], icon: 'leaf' },
    beast: { name: 'Bestie', stats: ['str', 'con', 'wis'], icon: 'claw' },
    blood: { name: 'Blut', stats: ['con', 'cha', 'str'], icon: 'drop' }
  };

  // Einträge: [Name, Beschreibung, Stufe (1 Selten, 2 Episch, 3 Legendär)]
  var ABILITIES = {
    martial: [
      ['Klingensturm', 'Wirbelt durch die Feinde und trifft alle Gegner in der Nähe für {n} Schaden.', 2],
      ['Schildwall', 'Blockt den nächsten Angriff vollständig und kontert mit {n} Schaden.', 2],
      ['Eiserner Wille', 'Passiv: Unter 30 % Leben steigt die Rüstung um {n} %.', 1],
      ['Kriegsschrei', 'Verbündete in Rufweite erhalten {n} % mehr Angriffskraft.', 2],
      ['Spaltender Hieb', 'Ein wuchtiger Schlag, der Rüstung bricht und {n} Schaden verursacht.', 1],
      ['Unerschütterlich', 'Passiv: Immun gegen Furcht; Betäubungen dauern {n} % kürzer.', 1],
      ['Sturmangriff', 'Stürmt auf ein Ziel zu und wirft es für {n} Sekunden zu Boden.', 1],
      ['Klingenparade', 'Pariert Nahkampfangriffe und erhält {n} % Ausweichen.', 1],
      ['Narbenhaut', 'Passiv: Jede überlebte Schlacht erhöht das maximale Leben um {n}.', 2],
      ['Hinrichtung', 'Tötet verwundete Gegner sofort; sonst {n} Schaden.', 3]
    ],
    arcane: [
      ['Arkane Lanze', 'Ein Strahl reiner Magie durchbohrt alle Ziele in einer Linie für {n} Schaden.', 2],
      ['Zeitriss', 'Verlangsamt die Zeit um das Ziel für {n} Sekunden.', 3],
      ['Spiegelbilder', 'Erschafft {n} Trugbilder, die Angriffe auf sich ziehen.', 1],
      ['Manaschild', 'Wandelt erlittenen Schaden zu {n} % in Mana um.', 2],
      ['Sternenfall', 'Lässt Meteore regnen, die {n} Feuerschaden verursachen.', 2],
      ['Runenbann', 'Versiegelt die Magie eines Gegners für {n} Sekunden.', 2],
      ['Gedankenlesen', 'Passiv: Erkennt Lügen und die nächste Absicht des Gegners.', 1],
      ['Teleport', 'Springt bis zu {n} Schritt weit an einen sichtbaren Ort.', 1],
      ['Frostnova', 'Friert alle Gegner in der Nähe für {n} Sekunden ein.', 1],
      ['Arkanes Echo', 'Passiv: {n} % Chance, jeden Zauber kostenlos zu wiederholen.', 3]
    ],
    shadow: [
      ['Schattenschritt', 'Verschwindet und taucht hinter dem Ziel auf; nächster Angriff +{n} % Schaden.', 1],
      ['Giftklinge', 'Vergiftet das Ziel: {n} Schaden über 6 Sekunden.', 1],
      ['Mantel der Nacht', 'Wird für {n} Sekunden unsichtbar.', 2],
      ['Meuchelstoß', 'Ein Angriff aus dem Verborgenen für {n} kritischen Schaden.', 2],
      ['Flüsterndes Grauen', 'Versetzt Gegner in Furcht; sie fliehen {n} Sekunden.', 1],
      ['Seelenraub', 'Stiehlt {n} Leben und heilt sich selbst um denselben Wert.', 2],
      ['Schattenfessel', 'Bindet das Ziel an seinen eigenen Schatten für {n} Sekunden.', 1],
      ['Zwielicht', 'Passiv: In Dunkelheit {n} % höhere Ausweichchance.', 1],
      ['Nebelgestalt', 'Wird körperlos; nimmt {n} % weniger körperlichen Schaden.', 2],
      ['Fluch der Leere', 'Das Ziel erleidet für 10 Sekunden {n} % mehr Schaden.', 3]
    ],
    holy: [
      ['Heiliges Licht', 'Heilt einen Verbündeten um {n} Leben.', 1],
      ['Göttlicher Schild', 'Ein Verbündeter wird für {n} Sekunden unverwundbar.', 3],
      ['Läuterung', 'Entfernt alle Flüche und verursacht {n} Schaden an Untoten.', 1],
      ['Aura der Hingabe', 'Passiv: Verbündete in der Nähe erhalten {n} Rüstung.', 2],
      ['Urteil', 'Ruft einen Lichtstrahl herab, der {n} heiligen Schaden verursacht.', 2],
      ['Segen der Morgenröte', 'Stellt bei Sonnenaufgang {n} % Leben aller Verbündeten wieder her.', 1],
      ['Sanktum', 'Weiht den Boden; Feinde darauf verlieren {n} Leben pro Sekunde.', 1],
      ['Märtyrer', 'Übernimmt {n} % des Schadens eines Verbündeten.', 2],
      ['Wiederauferstehung', 'Belebt einen gefallenen Verbündeten mit {n} % Leben wieder.', 3],
      ['Gebet der Klarheit', 'Passiv: Immun gegen Verwirrung und Bezauberung.', 1]
    ],
    nature: [
      ['Dornenranken', 'Ranken fesseln Gegner und verursachen {n} Schaden.', 1],
      ['Ruf der Wildnis', 'Beschwört einen Wolf, Bären oder Falken für {n} Sekunden.', 2],
      ['Regeneration', 'Heilt {n} Leben über 10 Sekunden.', 1],
      ['Gestaltwandel', 'Nimmt Tiergestalt an: +{n} % Tempo und Stärke.', 2],
      ['Gewittersturm', 'Blitze schlagen in zufällige Gegner ein, je {n} Schaden.', 2],
      ['Waldläufer', 'Passiv: Hinterlässt keine Spuren; +{n} % Tempo im Gelände.', 1],
      ['Sporenwolke', 'Eine Wolke aus Sporen schläfert Gegner {n} Sekunden ein.', 1],
      ['Rindenhaut', 'Die Haut wird hart wie Eiche: {n} % weniger Schaden.', 2],
      ['Tiersprache', 'Passiv: Versteht alle Tiere und kann ihnen Fragen stellen.', 1],
      ['Präziser Schuss', 'Ein Pfeil, der nie verfehlt, für {n} Schaden.', 3]
    ],
    beast: [
      ['Zerfetzen', 'Mehrere Klauenhiebe für insgesamt {n} Schaden.', 1],
      ['Urgebrüll', 'Lässt den Boden beben und betäubt Gegner {n} Sekunden.', 2],
      ['Flammenodem', 'Speit Feuer in einem Kegel für {n} Schaden.', 2],
      ['Schuppenpanzer', 'Passiv: Ignoriert die ersten {n} Punkte jedes Treffers.', 2],
      ['Jagdinstinkt', 'Passiv: Spürt verwundete Beute über {n} Meilen hinweg.', 1],
      ['Schwingenschlag', 'Ein Sturmwind wirft alle Gegner {n} Schritt zurück.', 1],
      ['Versteinernder Blick', 'Das Ziel erstarrt für {n} Sekunden zu Stein.', 3],
      ['Uralte Regeneration', 'Wachsen abgetrennte Glieder nach; heilt {n} Leben pro Sekunde.', 3],
      ['Rudelführer', 'Beschwört {n} Kreaturen seiner Art zur Hilfe.', 2],
      ['Giftbiss', 'Ein Biss mit lähmendem Gift: {n} Schaden und Verlangsamung.', 1]
    ],
    blood: [
      ['Blutpakt', 'Opfert {n} Leben für doppelte Zauberkraft.', 2],
      ['Aderlass', 'Lässt das Blut der Feinde kochen: {n} Schaden.', 1],
      ['Durst', 'Passiv: Jeder Treffer heilt um {n} % des Schadens.', 2],
      ['Totenbeschwörung', 'Erhebt {n} Skelette aus den Gefallenen.', 2],
      ['Blutnebel', 'Verwandelt sich in roten Nebel und weicht allen Angriffen aus.', 3],
      ['Marionettenfaden', 'Übernimmt für {n} Sekunden die Kontrolle über einen Gegner.', 3],
      ['Verderbnis', 'Eine Seuche springt von Gegner zu Gegner: {n} Schaden.', 1],
      ['Knochenrüstung', 'Umgibt sich mit Knochen, die {n} Schaden absorbieren.', 1],
      ['Ewiger Hunger', 'Passiv: Wird mit jedem Opfer in der Nähe {n} % stärker.', 2],
      ['Seelenkette', 'Verbindet zwei Gegner; Schaden an einem trifft beide zu {n} %.', 1]
    ]
  };

  // Ultimative Fähigkeiten (ab Episch, Stufe Legendär) und mythische Gaben (Stufe Mythisch)
  var ULTIMATES = {
    martial: ['Zorn der Tausend Klingen', 'Wird für 12 Sekunden zum unaufhaltsamen Wirbelwind aus Stahl: {n} Schaden pro Sekunde.'],
    arcane: ['Riss im Weltgefüge', 'Öffnet ein Tor in die Leere, das alle Feinde für {n} Schaden verschlingt.'],
    shadow: ['Ewige Nacht', 'Löscht jedes Licht im Umkreis; alle Angriffe sind 10 Sekunden lang kritisch (+{n} %).'],
    holy: ['Gottesurteil', 'Ein Säulenstrahl aus Licht heilt alle Verbündeten und vernichtet Böses für {n} Schaden.'],
    nature: ['Zorn des Hains', 'Der Wald erwacht: Uralte Bäume zermalmen Feinde für {n} Schaden.'],
    beast: ['Erwachen des Urwesens', 'Wächst auf doppelte Größe; jeder Angriff verursacht +{n} % Schaden.'],
    blood: ['Rote Ernte', 'Entzieht allen Lebewesen im Umkreis {n} Leben und wird davon unsterblich für 5 Sekunden.']
  };

  var GIFTS = [
    ['Gabe: Unsterblich', 'Stirbt {d} Held{in}, kehrt {er} beim nächsten Vollmond zurück.'],
    ['Gabe: Weltenwanderer', 'Kann einmal pro Tag zwischen den Welten reisen.'],
    ['Gabe: Prophezeit', 'Das Schicksal selbst lenkt Schläge ab, die {ihn} töten würden.'],
    ['Gabe: Seelenschmiede', 'Kann die Seele eines Besiegten in eine Waffe bannen.'],
    ['Gabe: Wahrer Name', 'Wer {seinen} wahren Namen ausspricht, fällt in ewigen Schlaf.'],
    ['Gabe: Zeitlos', 'Altert nicht; hat den Untergang dreier Reiche gesehen.']
  ];

  // Stile: Namen, Völker, Klassen, Orte, Waffen, Lore-Bausteine
  var STYLES = {
    high: {
      name: 'High Fantasy', short: 'High', colors: ['#2a5db0', '#f0c96b', '#0d1b3a'],
      names: {
        pre: ['Ael', 'Ela', 'Thal', 'Syl', 'Lor', 'Fae', 'Ith', 'Cael', 'Aer', 'Mir', 'Elen', 'Gal', 'Lu', 'Ser', 'Ny', 'Ari'],
        mid: ['an', 'ri', 'the', 'va', 'lo', 'dri', 'ne', 'sa', 'la', ''],
        end: [['dor', 'ion', 'ras', 'wyn', 'ael', 'or', 'andil', 'en', 'thas'], ['wen', 'iel', 'ara', 'eth', 'ria', 'ys', 'anna', 'ine', 'thea']]
      },
      epithets: ['{d} Sternenkind', '{d} Lichtbringer{in}', 'vom Silberhain', '{d} Ewigwache', 'aus dem Hause Morgentau',
        '{d} Strahlende', 'von den Weißen Türmen', '{d} Mondgekrönte', '{d} Hüter{in} der Flamme', 'Sonnenschwinge'],
      races: [['Hochelf', 'Hochelfe'], ['Mensch', 'Mensch'], ['Zwerg', 'Zwergin'], ['Halbelf', 'Halbelfe'], ['Sternengeborener', 'Sternengeborene'],
        ['Halbling', 'Halbling'], ['Drachenblütiger', 'Drachenblütige'], ['Waldelf', 'Waldelfe']],
      classes: [
        [['Paladin', 'Paladinin'], 'holy'], [['Erzmagier', 'Erzmagierin'], 'arcane'], [['Waldläufer', 'Waldläuferin'], 'nature'],
        [['Klingentänzer', 'Klingentänzerin'], 'martial'], [['Sternendeuter', 'Sternendeuterin'], 'arcane'], [['Kleriker', 'Klerikerin'], 'holy'],
        [['Drachenritter', 'Drachenritterin'], 'martial'], [['Barde', 'Bardin'], 'arcane'], [['Druide', 'Druidin'], 'nature']
      ],
      places: ['den Kristallwäldern von Aelthar', 'der Himmelsstadt Lumeris', 'den Schneegipfeln von Valdris', 'der Elfenfeste Sylvanor',
        'den Goldenen Ebenen', 'der Inselstadt Cael Mira', 'den Hallen unter dem Berg Durnhold'],
      foes: ['den Schattenkönig', 'die Drachin Vyrmathra', 'den gefallenen Erzmagier Ozrel', 'die Legion der Leere', 'einen verbannten Gott'],
      artifacts: ['die Krone der Sterne', 'das Schwert Morgenglanz', 'den Kelch von Lumeris', 'das Buch der Ersten Worte', 'den Drachenstein'],
      weapons: ['Elfenklinge „Mondsichel“', 'Stab aus Weltenbaumholz', 'Langbogen „Silberwind“', 'Mithrilhammer', 'Sternenlanze',
        'Laute mit Saiten aus Licht', 'Runenschwert „Dämmerbrecher“'],
      weaponTiers: [2, 2, 2, 1, 1, 1, 3],
      quotes: ['„Solange ein Stern am Himmel steht, ist nichts verloren.“', '„Licht braucht keinen Zorn, um zu brennen.“',
        '„Ich habe geschworen. Das genügt.“', '„Die Lieder werden sich an uns erinnern.“', '„Hoffnung ist die schärfste Klinge.“']
    },
    dark: {
      name: 'Dark Fantasy', short: 'Dark', colors: ['#5b1a2a', '#8b5cf6', '#0a0608'],
      names: {
        pre: ['Mor', 'Vex', 'Skar', 'Drak', 'Zul', 'Nyx', 'Kael', 'Grim', 'Vor', 'Ash', 'Mal', 'Raz', 'Sev', 'Thra', 'Ul', 'Varg'],
        mid: ['ga', 'th', 'ka', 'ro', 'za', 've', 'ma', ''],
        end: [['oth', 'gar', 'rak', 'zul', 'mir', 'eth', 'axis', 'ruk', 'ion'], ['yra', 'ith', 'essa', 'ira', 'ael', 'ora', 'ya', 'ix', 'ess']]
      },
      epithets: ['{d} Verfluchte', '{d} Aschgeborene', '{d} Schattenlose', '{d} Knochenkönig{in}', 'Seelenfresser{in}',
        '{d} Letzte {seines} Blutes', 'vom Schwarzen Moor', '{d} Ungetaufte', '{d} Rabenvater|{d} Rabenmutter', '{d} Blutige', 'ohne Herz'],
      races: [['Untoter', 'Untote'], ['Vampir', 'Vampirin'], ['Dunkelelf', 'Dunkelelfe'], ['Verfluchter Mensch', 'Verfluchte Menschenfrau'],
        ['Dämonenblütiger', 'Dämonenblütige'], ['Schattenwandler', 'Schattenwandlerin'], ['Ghul', 'Ghulin'], ['Gefallener Engel', 'Gefallener Engel']],
      classes: [
        [['Nekromant', 'Nekromantin'], 'blood'], [['Blutmagier', 'Blutmagierin'], 'blood'], [['Assassine', 'Assassinin'], 'shadow'],
        [['Todesritter', 'Todesritterin'], 'martial'], [['Hexenjäger', 'Hexenjägerin'], 'martial'], [['Hexer', 'Hexe'], 'arcane'],
        [['Schattenklinge', 'Schattenklinge'], 'shadow'], [['Seelenhirte', 'Seelenhirtin'], 'blood'], [['Verdammter Paladin', 'Verdammte Paladinin'], 'holy']
      ],
      places: ['den Ruinen von Mor Varach', 'einem Dorf ohne Namen', 'den Katakomben unter Grauhafen',
        'dem Aschewald von Skarn', 'der Pestinsel Ul Thaar', 'einem Kloster mit ewig läutenden Glocken', 'den Blutsümpfen von Vexmoor'],
      foes: ['den Hohen Inquisitor', 'die Hexenkönigin Morwen', 'den Namenlosen Hunger', 'die Kirche der Bleichen Flamme', 'einen Dämonenfürsten',
        'die eigene Familie'],
      artifacts: ['die Krone aus Knochen', 'das Herz eines toten Gottes', 'das Buch der Verdammten', 'die Klinge „Witwenmacher“',
        'den seelenfressenden Spiegel'],
      weapons: ['Sense „Totenernte“', 'Zweihänder aus schwarzem Stahl', 'Ritualdolch aus Obsidian', 'Knochenstab mit Schädelkrone',
        'Kettenpeitsche', 'Rostige Henkersaxt', 'Zwillingsdolche „Gift & Galle“'],
      weaponTiers: [3, 2, 1, 2, 1, 1, 2],
      quotes: ['„Die Götter schweigen. Also spreche ich.“', '„Jeder bezahlt. Früher oder später.“', '„Ich bin nicht das Monster. Ich bin, was danach kommt.“',
        '„Die Dunkelheit hat mich nie verlassen. Sie hat gewartet.“', '„Bete, wenn es dir hilft.“', '„Blut vergisst nicht.“']
    },
    mythic: {
      name: 'Mythische Kreaturen', short: 'Mythisch', colors: ['#0f766e', '#a5f3fc', '#06151a'],
      names: {
        pre: ['Qua', 'Tia', 'Yr', 'Oru', 'Sha', 'Kri', 'Xa', 'Ama', 'Huo', 'Zeph', 'Bae', 'Ixa', 'Ko', 'Thal'],
        mid: ['la', 'ra', 'shi', 'nu', 'ka', 'ae', ''],
        end: [['thar', 'lyx', 'ruun', 'kai', 'sar', 'goth', 'mon', 'rax'], ['mora', 'shai', 'lya', 'rin', 'naa', 'thys', 'ra', 'vae']]
      },
      epithets: ['{d} Uralte', 'Hüter{in} des Weltenbaums', '{d} Tausendjährige', 'aus der Tiefe', '{d} Sturmgeborene',
        '{d} Erste {seiner} Art', 'vom Ende der Welt', '{d} Schlafende', 'Feuerseele', '{d} Weiße'],
      races: [['Phönix', 'Phönix'], ['Greif', 'Greifin'], ['Drache', 'Drachin'], ['Kitsune', 'Kitsune'], ['Naga', 'Naga'],
        ['Nachtmahr', 'Nachtmahr'], ['Sphinx', 'Sphinx'], ['Wyrm', 'Wyrm'], ['Einhorn', 'Einhorn'], ['Leviathan', 'Leviathan'], ['Basilisk', 'Basilisk']],
      classes: [
        [['Sturmrufer', 'Sturmruferin'], 'nature'], [['Uralter Wächter', 'Uralte Wächterin'], 'beast'], [['Rätselweber', 'Rätselweberin'], 'arcane'],
        [['Seelenführer', 'Seelenführerin'], 'holy'], [['Weltenfresser', 'Weltenfresserin'], 'beast'], [['Traumwandler', 'Traumwandlerin'], 'shadow'],
        [['Hainhüter', 'Hainhüterin'], 'nature'], [['Feuerbringer', 'Feuerbringerin'], 'beast']
      ],
      places: ['einem Ei aus Vulkanglas', 'den Wolken über dem Gipfel Ixa', 'einem See ohne Grund', 'den Wurzeln des Weltenbaums',
        'den Sternen selbst', 'einer Höhle hinter dem Wasserfall von Oru', 'den Träumen eines schlafenden Gottes'],
      foes: ['die Drachenjäger von Kael', 'das Vergessen', 'einen gierigen König', 'den Großen Winter', 'ein Geschwister aus demselben Ei'],
      artifacts: ['die Erste Feder', 'eine Schuppe des Weltendrachen', 'die Träne des Mondes', 'den Ring der Gezeiten', 'das Ei, aus dem alles schlüpfte'],
      weapons: ['Klauen aus Sternenstahl', 'Hörner, die Magie spalten', 'Flammenschwingen', 'Giftzähne', 'Ein Blick, der versteinert',
        'Schuppenpanzer härter als Diamant', 'Atem aus kaltem Feuer'],
      weaponTiers: [2, 2, 2, 1, 3, 1, 2],
      quotes: ['„Ich war hier, bevor eure Könige Namen hatten.“', '„Die Welt atmet. Ich höre zu.“', '„Fürchte nicht mich. Fürchte, wenn ich gehe.“',
        '„Jedes Rätsel hat zwei Antworten. Eine davon tötet.“', '„Feuer stirbt nicht. Es wartet.“']
    },
    medieval: {
      name: 'Mittelalter', short: 'Mittelalter', colors: ['#7c2d12', '#e5e7eb', '#14100c'],
      first: [['Gottfried', 'Konrad', 'Ulrich', 'Leopold', 'Bertram', 'Wolfram', 'Heinrich', 'Roderich', 'Eberhard', 'Siegmund', 'Lothar',
        'Aldric', 'Edmund', 'Godric', 'Roland', 'Tankred', 'Hagen', 'Gunther'],
      ['Adelheid', 'Mechthild', 'Kunigunde', 'Isolde', 'Hildegard', 'Brunhild', 'Gisela', 'Irmgard', 'Elisabeth', 'Rosalind', 'Mathilda',
        'Gwendolyn', 'Agnes', 'Beatrix', 'Ottilie', 'Kriemhild', 'Walburga', 'Ermengard']],
      houses: ['von Rabenfels', 'von Eisenhain', 'von Dornburg', 'zu Schwarzwasser', 'von Falkenstein', 'von Aschenau', 'vom Grauen Turm',
        'von Wolfsried', 'zu Eichenhall', 'von Kaltenbrunn', 'von Hohenstein', 'zu Nebelfurt'],
      epithets: ['{d} Eiserne', '{d} Unbeugsame', '{d} Gnadenlose', 'Löwenherz', '{d} Fromme', '{d} Ketzer{in}', 'Schwarzschild',
        '{d} Kühne', '{d} Bastard{in}', 'Schwertbrecher{in}'],
      races: [['Mensch', 'Mensch'], ['Nordmann', 'Nordfrau'], ['Bergvolk', 'Bergvolk'], ['Halbork', 'Halborkin'], ['Kreuzfahrer', 'Kreuzfahrerin']],
      classes: [
        [['Ritter', 'Ritterin'], 'martial'], [['Bogenschütze', 'Bogenschützin'], 'nature'], [['Inquisitor', 'Inquisitorin'], 'holy'],
        [['Söldner', 'Söldnerin'], 'martial'], [['Alchemist', 'Alchemistin'], 'arcane'], [['Templer', 'Templerin'], 'holy'],
        [['Raubritter', 'Raubritterin'], 'shadow'], [['Henker', 'Henkerin'], 'martial'], [['Kräuterkundiger', 'Kräuterkundige'], 'nature'], [['Spion', 'Spionin'], 'shadow']
      ],
      places: ['der Grenzfeste Dornburg', 'einem Bauernhof am Rande des Reiches', 'der Klosterschule von Sankt Anselm', 'den Gassen der Hafenstadt Brakmund',
        'einer Burg, die im Krieg fiel', 'dem Heerlager des Königs', 'den Salzminen von Kaltenbrunn'],
      foes: ['den Usurpator auf dem Thron', 'die Raubritter vom Grauen Turm', 'den Schwarzen Tod', 'den Bischof von Aschenau', 'einen verräterischen Bruder',
        'die Heere aus dem Osten'],
      artifacts: ['das Siegel des alten Königs', 'einen Splitter der Heiligen Lanze', 'den Kriegsschatz von Rabenfels', 'das Banner der Gefallenen',
        'den geheimen Friedensbrief des Königs'],
      weapons: ['Langschwert mit Familienwappen', 'Morgenstern', 'Englischer Langbogen', 'Hellebarde', 'Streitkolben', 'Armbrust mit Bolzen aus Silber',
        'Bidenhänder', 'Flegel und Turmschild'],
      weaponTiers: [2, 1, 2, 1, 1, 3, 2, 1],
      quotes: ['„Für Krone und Land – oder wenigstens für Gold.“', '„Ein Eid ist schwerer als jede Rüstung.“', '„Gott wird die Seinen erkennen.“',
        '„Ich habe Könige fallen sehen. Du bist keiner.“', '„Ehre ist teuer. Ich zahle sie trotzdem.“', '„Das Schwert lügt nicht.“']
    }
  };

  // Lore-Bausteine: Herkunft, Wendepunkt, Ziel, Geheimnis
  var LORE = {
    origin: [
      '{name} wurde in {ort} geboren, in einer Nacht, in der kein Stern am Himmel stand.',
      'Aufgewachsen in {ort}, lernte {name} früh, dass Gnade ein Luxus ist.',
      'Niemand weiß, seit wann {name} in {ort} lebt – nur, dass {er} seitdem nicht gealtert ist.',
      'Als Kind wurde {name} in {ort} ausgesetzt und von Fremden großgezogen.',
      '{name} stammt aus {ort}. {Seine} Familie wacht dort seit Generationen über alte Geheimnisse.',
      'Die Chroniken von {ort} erwähnen {name} zum ersten Mal vor dreihundert Jahren.'
    ],
    turn: [
      'Als {seine} Heimat durch {feind} in Flammen aufging, schwor {er} Rache.',
      'Ein Pakt, den {er} in jungen Jahren schloss, fordert nun seinen Preis.',
      'Nach dem Verrat durch {seinen} engsten Gefährten ging {er} fortan allein.',
      'Eine Prophezeiung nennt {ihn} als jene Person, die {feind} zu Fall bringen wird.',
      'In der Schlacht am Grauen Pass starb {er} – und kehrte drei Tage später zurück.',
      'Seit {er} {artefakt} berührt hat, hört {er} eine Stimme, die nicht {seine} eigene ist.',
      'Für ein Verbrechen, das {er} nicht beging, wurde {er} verbannt.'
    ],
    goal: [
      'Heute sucht {er} {artefakt}, um {feind} endgültig zu vernichten.',
      'Nun jagt {er} {feind} quer durch die Reiche – ohne Rast und ohne Gnade.',
      '{Er} will {artefakt} finden, ehe die letzte Spur erkaltet.',
      'Einzig ein Ziel treibt {ihn} an: den Namen {seiner} Familie reinzuwaschen.',
      '{Er} sammelt Verbündete für den letzten Krieg gegen {feind}.',
      'Man sagt, {er} wolle {artefakt} zerstören – doch manche fürchten das Gegenteil.'
    ],
    secret: [
      'Was niemand ahnt: {Er} liebte einst {feind}.',
      'Geheim: {Sein} wahrer Name steht in einem Buch, das niemand lesen darf.',
      'Geheim: {Er} ist nicht die erste Person, die diesen Namen trägt.',
      'Geheim: Jede Nacht träumt {er} von einem Tor, das sich langsam öffnet.',
      'Geheim: {Er} hat {feind} einst selbst beschworen.',
      'Geheim: {Seine} Narben leuchten, wenn Magie in der Nähe ist.',
      'Geheim: {Er} kennt das Versteck, in dem man {artefakt} verborgen hat – und schweigt.'
    ]
  };

  var PRONOUNS = {
    m: { er: 'er', Er: 'Er', sein: 'sein', Sein: 'Sein', seine: 'seine', Seine: 'Seine', seinen: 'seinen', seinem: 'seinem', seiner: 'seiner', seines: 'seines', ihn: 'ihn', ihm: 'ihm', d: 'der', in: '' },
    f: { er: 'sie', Er: 'Sie', sein: 'ihr', Sein: 'Ihr', seine: 'ihre', Seine: 'Ihre', seinen: 'ihren', seinem: 'ihrem', seiner: 'ihrer', seines: 'ihres', ihn: 'sie', ihm: 'ihr', d: 'die', in: 'in' }
  };

  return {
    RARITIES: RARITIES, STATS: STATS, ALIGNMENTS: ALIGNMENTS, ARCHETYPES: ARCHETYPES, ABILITIES: ABILITIES,
    ULTIMATES: ULTIMATES, GIFTS: GIFTS, STYLES: STYLES, LORE: LORE, PRONOUNS: PRONOUNS,
    STYLE_IDS: ['high', 'dark', 'mythic', 'medieval']
  };
})();

if (typeof module !== 'undefined') module.exports = DF_DATA;
