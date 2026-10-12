set -e
IMP=~/.claude/skills/impeccable/scripts/impeccable
cd /Users/tarikmoody/Projects/dycu/inventory
for d in a b; do
  for dev in laptop phone print; do
    case $dev in
      laptop) size=1536x1024; ref=.impeccable/review/fact-sheet-ref-laptop.png; frame="Laptop web page 1536x1024, rendered flat as a real UI screenshot, no device frame.";;
      phone) size=1024x1536; ref=.impeccable/review/fact-sheet-ref-phone.png; frame="Mobile web page, portrait phone viewport 390x844 scaled up, rendered flat as a real UI screenshot, no device frame. Masthead collapses to the wordmark and a MENU button.";;
      print) size=1024x1536; ref=.impeccable/review/fact-sheet-ref-laptop.png; frame="The same page PRINTED on one US Letter sheet in black ink on white paper: no site navigation, no buttons, no folded tables; title, headline figures, small map, notes and sources fit on the one page.";;
    esac
    { echo "$frame"; echo; cat .impeccable/mocks/fact-sheet-$d.md; echo; cat .impeccable/mocks/fact-sheet-content.md; } > .impeccable/mocks/fact-sheet-$d-$dev.prompt.txt
    $IMP generate-image --ref $ref --prompt-file .impeccable/mocks/fact-sheet-$d-$dev.prompt.txt --out .impeccable/mocks/fact-sheet-$d-$dev.webp --size $size
  done
done
