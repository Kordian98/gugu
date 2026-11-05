# Walk-in, klawiatura i wygoda na telefonie — 2026-11-05

Kontynuacja [audytu CRM](../07-crm-saas-audit/README.md), skupiona na szybkiej obsłudze klienta bez rezerwacji oraz formularzach używanych jedną ręką.

## Zmiany

- **Walk-in z ekranu Dzisiaj:** otwarcie → usługa → zatwierdzenie. Przy jednej opcji usługi wystarczą otwarcie i zatwierdzenie. Bez wpisywania klienta, telefonu i bez otwierania klawiatury. Godzina, pracownik i orientacyjna cena usługi są widoczne przed zapisem; dodatkowy wybór godziny/pracownika rozwija się w tym samym formularzu.
- **Czytelna obsługa niepowodzeń:** brak wolnego miejsca dzisiaj nie przełącza wizyty na jutro. Konflikt terminu zachowuje wybór usługi, odświeża dostępność i wymaga ponownego zatwierdzenia. Oczekujący zapis blokuje powtórne wysłanie i zamknięcie. Po dłuższej bezczynności i powrocie do aplikacji dostępność jest sprawdzana ponownie.
- **Formularze na małym ekranie:** przewijane pola i dostępne przyciski u dołu, uwzględnione bezpieczne obszary ekranu oraz klawiatura. Jednoliniowe pola mają Done; jest też jawny przycisk schowania klawiatury, również numerycznej. Gest w dół na nagłówku chowa klawiaturę, zachowując formularz. iOS obsługuje interaktywne chowanie podczas przewijania, Android tryb on-drag. Ustawienie ograniczenia animacji jest respektowane.
- **Nawigacja dat:** dni tygodnia na Dzisiaj są klikalne i otwierają właściwy dzień kalendarza w strefie salonu. Mają cele dotykowe co najmniej44 punkty.
- **Zapis z klawiaturą:** nadrzędne widoki CRM przepuszczają tapnięcie do przycisku. Natywny test potwierdził zapis zmienionej ceny jednym tapnięciem przy otwartej klawiaturze numerycznej i odczyt ceny po ponownym otwarciu. Podczas zapisu edytor usługi blokuje ponowienie i zamknięcie.
- **Logowanie z nowego linku:** po błędnym lub wygasłym linku ekran obsługuje świeży token bez ręcznego wychodzenia; spóźniona odpowiedź poprzedniej próby nie przekierowuje użytkownika.
- **Błąd natywnego CRM:** komponent tytułu dokumentu WWW nie uruchamia się już na iOS/Android. Test natywnego builda wykrył, że wcześniej powodował błąd przy wejściu do CRM.

## Dowody i zakres

- Produkcyjny build web:6/6 testów Chromium/WebKit, oba języki. Obejmują szerokość360, krótkie widoki320×568 i390×420, widoczność stopki, wybory w formularzu, Escape i powrót fokusu, nawigację tygodnia oraz regresję rozciąganej i niestandardowej rezerwacji na desktopie.
- Szybki walk-in:4/4 testów vi/en × Chromium/WebKit z prawdziwym API i zapisem do testowego Postgresa. Obejmują3/2 tapnięcia, jeden zapis podczas oczekiwania, rzeczywisty konflikt409, błąd dostępności503 i ponowienie, zamknięty salon oraz brak automatycznego przejścia na jutro.
- `pnpm verify`:21/21 zadań przeszło; testy aplikacji47/47, w tym5 testów wyboru walk-in i4 testy cyklu weryfikacji linku.
- Natywny build Expo SDK58 na symulatorze iPhone17Pro/iOS26.4: trzy tapnięcia utworzyły jedną wizytę `walk_in` ze statusem `confirmed`, potwierdzoną odczytem bazy testowej. Testy systemowej klawiatury, schowania jej przyciskiem i gestem oraz zapisu jednym tapnięciem przeszły.
- Szczegóły formularzy: [interactions.md](interactions.md).
- Przegląd funkcji i poprawione ustalenia: [walk-in-review.md](walk-in-review.md).
- Natywna weryfikacja i jej ograniczenia: [native.md](native.md).

## Granice działania

Walk-in oznacza tutaj utworzenie wizyty ze źródłem `walk_in` na najwcześniejszą dopuszczalną godzinę dzisiaj. Nadal obowiązują reguły backendu, w tym wymagane wyprzedzenie. Zapis nie wykonuje automatycznego check-in. Cena w szybkim podsumowaniu jest orientacyjną ceną katalogową usługi; indywidualne warunki pracownika ustala backend podczas zapisu. Nie dodano przetwarzania płatności.

Testy przeglądarkowe nie potwierdzają działania klawiatury systemowej ani gestów na Androidzie. Fizyczne telefony nie były używane. Szczegóły faktycznie wykonanych testów natywnych znajdują się w raporcie natywnym.
