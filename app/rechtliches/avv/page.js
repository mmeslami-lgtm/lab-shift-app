import LegalPage, { Section } from "../../../components/LegalPage";
import { LEGAL_STAND, LEGAL_VERSIONS } from "../../../lib/legal";

export const metadata = { title: "Auftragsverarbeitungsvertrag (AVV)", robots: { index: false, follow: false } };

// Grundlage: Standardvertragsklauseln der EU-Kommission, Durchführungsbeschluss (EU) 2021/915 vom 4. Juni 2021
// (ABl. L 199 vom 7.6.2021, S. 18). Die Klauseln sind im Wortlaut übernommen (Klausel 2: nicht ändern!);
// ausgefüllt sind nur die Optionen und die Anhänge. Fassung in lib/legal.js erhöhen, wenn sich etwas ändert.
// Vor dem ersten zahlenden Kunden rechtlich prüfen lassen.

const ol = { margin: "6px 0 0", paddingLeft: 22 };
const H = ({ children }) => <h3 style={{ fontSize: 15, fontWeight: 700, margin: "14px 0 4px" }}>{children}</h3>;
const L = ({ children }) => <ol type="a" style={ol}>{children}</ol>;
const N = ({ children }) => <ol type="1" style={ol}>{children}</ol>;
const li = { marginBottom: 4 };

export default function Page() {
  return (
    <LegalPage title="Auftragsverarbeitungsvertrag (AVV)" updated={`${LEGAL_STAND} · Fassung ${LEGAL_VERSIONS.avv}`} printable>
      <Section title="Vorbemerkung">
        Dieser Vertrag regelt die Verarbeitung personenbezogener Daten durch Dienstigo im Auftrag des Kunden. Er besteht
        aus den Standardvertragsklauseln der Europäischen Kommission gemäß Artikel 28 Absatz 7 DSGVO
        (Durchführungsbeschluss (EU) 2021/915 vom 4. Juni 2021). Die Klauseln sind im Wortlaut übernommen; ausgewählt
        wurden nur die vorgesehenen Optionen, und die Anhänge I bis IV wurden für Dienstigo ausgefüllt. Die fakultative
        Klausel 5 wird nicht verwendet. Der Vertrag gilt für die Testphase und für jeden späteren Vertrag über die
        Nutzung von Dienstigo. Da in der Testphase nur fiktive Testdaten eingegeben werden dürfen, wird er dort
        vorsorglich geschlossen.
      </Section>

      <Section title="Abschnitt I">
        <H>Klausel 1 – Zweck und Anwendungsbereich</H>
        <L>
          <li style={li}>Mit diesen Standardvertragsklauseln (im Folgenden „Klauseln“) soll die Einhaltung von Artikel 28 Absätze 3 und 4 der Verordnung (EU) 2016/679 des Europäischen Parlaments und des Rates vom 27. April 2016 zum Schutz natürlicher Personen bei der Verarbeitung personenbezogener Daten, zum freien Datenverkehr und zur Aufhebung der Richtlinie 95/46/EG (Datenschutz-Grundverordnung) sichergestellt werden.</li>
          <li style={li}>Die in Anhang I aufgeführten Verantwortlichen und Auftragsverarbeiter haben diesen Klauseln zugestimmt, um die Einhaltung von Artikel 28 Absätze 3 und 4 der Verordnung (EU) 2016/679 und/oder Artikel 29 Absätze 3 und 4 der Verordnung (EU) 2018/1725 zu gewährleisten.</li>
          <li style={li}>Diese Klauseln gelten für die Verarbeitung personenbezogener Daten gemäß Anhang II.</li>
          <li style={li}>Die Anhänge I bis IV sind Bestandteil der Klauseln.</li>
          <li style={li}>Diese Klauseln gelten unbeschadet der Verpflichtungen, denen der Verantwortliche gemäß der Verordnung (EU) 2016/679 und/oder der Verordnung (EU) 2018/1725 unterliegt.</li>
          <li style={li}>Diese Klauseln stellen für sich allein genommen nicht sicher, dass die Verpflichtungen im Zusammenhang mit internationalen Datenübermittlungen gemäß Kapitel V der Verordnung (EU) 2016/679 und/oder der Verordnung (EU) 2018/1725 erfüllt werden.</li>
        </L>
        <H>Klausel 2 – Unabänderbarkeit der Klauseln</H>
        <L>
          <li style={li}>Die Parteien verpflichten sich, die Klauseln nicht zu ändern, es sei denn, zur Ergänzung oder Aktualisierung der in den Anhängen angegebenen Informationen.</li>
          <li style={li}>Dies hindert die Parteien nicht daran die in diesen Klauseln festgelegten Standardvertragsklauseln in einen umfangreicheren Vertrag aufzunehmen und weitere Klauseln oder zusätzliche Garantien hinzuzufügen, sofern diese weder unmittelbar noch mittelbar im Widerspruch zu den Klauseln stehen oder die Grundrechte oder Grundfreiheiten der betroffenen Personen beschneiden.</li>
        </L>
        <H>Klausel 3 – Auslegung</H>
        <L>
          <li style={li}>Werden in diesen Klauseln die in der Verordnung (EU) 2016/679 bzw. der Verordnung (EU) 2018/1725 definierten Begriffe verwendet, so haben diese Begriffe dieselbe Bedeutung wie in der betreffenden Verordnung.</li>
          <li style={li}>Diese Klauseln sind im Lichte der Bestimmungen der Verordnung (EU) 2016/679 bzw. der Verordnung (EU) 2018/1725 auszulegen.</li>
          <li style={li}>Diese Klauseln dürfen nicht in einer Weise ausgelegt werden, die den in der Verordnung (EU) 2016/679 oder der Verordnung (EU) 2018/1725 vorgesehenen Rechten und Pflichten zuwiderläuft oder die Grundrechte oder Grundfreiheiten der betroffenen Personen beschneidet.</li>
        </L>
        <H>Klausel 4 – Vorrang</H>
        <p style={{ margin: 0 }}>Im Falle eines Widerspruchs zwischen diesen Klauseln und den Bestimmungen damit zusammenhängender Vereinbarungen, die zwischen den Parteien bestehen oder später eingegangen oder geschlossen werden, haben diese Klauseln Vorrang.</p>
        <H>Klausel 5 – fakultativ, Kopplungsklausel</H>
        <p style={{ margin: 0 }}>Wird nicht verwendet.</p>
      </Section>

      <Section title="Abschnitt II – Pflichten der Parteien">
        <H>Klausel 6 – Beschreibung der Verarbeitung</H>
        <p style={{ margin: 0 }}>Die Einzelheiten der Verarbeitungsvorgänge, insbesondere die Kategorien personenbezogener Daten und die Zwecke, für die die personenbezogenen Daten im Auftrag des Verantwortlichen verarbeitet werden, sind in Anhang II aufgeführt.</p>
        <H>Klausel 7 – Pflichten der Parteien</H>
        <p style={{ margin: "6px 0 0", fontWeight: 600 }}>7.1. Weisungen</p>
        <L>
          <li style={li}>Der Auftragsverarbeiter verarbeitet personenbezogene Daten nur auf dokumentierte Weisung des Verantwortlichen, es sei denn, er ist nach Unionsrecht oder nach dem Recht eines Mitgliedstaats, dem er unterliegt, zur Verarbeitung verpflichtet. In einem solchen Fall teilt der Auftragsverarbeiter dem Verantwortlichen diese rechtlichen Anforderungen vor der Verarbeitung mit, sofern das betreffende Recht dies nicht wegen eines wichtigen öffentlichen Interesses verbietet. Der Verantwortliche kann während der gesamten Dauer der Verarbeitung personenbezogener Daten weitere Weisungen erteilen. Diese Weisungen sind stets zu dokumentieren.</li>
          <li style={li}>Der Auftragsverarbeiter informiert den Verantwortlichen unverzüglich, wenn er der Auffassung ist, dass vom Verantwortlichen erteilte Weisungen gegen die Verordnung (EU) 2016/679, die Verordnung (EU) 2018/1725 oder geltende Datenschutzbestimmungen der Union oder der Mitgliedstaaten verstoßen.</li>
        </L>
        <p style={{ margin: "8px 0 0", fontWeight: 600 }}>7.2. Zweckbindung</p>
        <p style={{ margin: 0 }}>Der Auftragsverarbeiter verarbeitet die personenbezogenen Daten nur für den/die in Anhang II genannten spezifischen Zweck(e), sofern er keine weiteren Weisungen des Verantwortlichen erhält.</p>
        <p style={{ margin: "8px 0 0", fontWeight: 600 }}>7.3. Dauer der Verarbeitung personenbezogener Daten</p>
        <p style={{ margin: 0 }}>Die Daten werden vom Auftragsverarbeiter nur für die in Anhang II angegebene Dauer verarbeitet.</p>
        <p style={{ margin: "8px 0 0", fontWeight: 600 }}>7.4. Sicherheit der Verarbeitung</p>
        <L>
          <li style={li}>Der Auftragsverarbeiter ergreift mindestens die in Anhang III aufgeführten technischen und organisatorischen Maßnahmen, um die Sicherheit der personenbezogenen Daten zu gewährleisten. Dies umfasst den Schutz der Daten vor einer Verletzung der Sicherheit, die, ob unbeabsichtigt oder unrechtmäßig, zur Vernichtung, zum Verlust, zur Veränderung oder zur unbefugten Offenlegung von beziehungsweise zum unbefugten Zugang zu den Daten führt (im Folgenden „Verletzung des Schutzes personenbezogener Daten“). Bei der Beurteilung des angemessenen Schutzniveaus tragen die Parteien dem Stand der Technik, den Implementierungskosten, der Art, dem Umfang, den Umständen und den Zwecken der Verarbeitung sowie den für die betroffenen Personen verbundenen Risiken gebührend Rechnung.</li>
          <li style={li}>Der Auftragsverarbeiter gewährt seinem Personal nur insoweit Zugang zu den personenbezogenen Daten, die Gegenstand der Verarbeitung sind, als dies für die Durchführung, Verwaltung und Überwachung des Vertrags unbedingt erforderlich ist. Der Auftragsverarbeiter gewährleistet, dass sich die zur Verarbeitung der erhaltenen personenbezogenen Daten befugten Personen zur Vertraulichkeit verpflichtet haben oder einer angemessenen gesetzlichen Verschwiegenheitspflicht unterliegen.</li>
        </L>
        <p style={{ margin: "8px 0 0", fontWeight: 600 }}>7.5. Sensible Daten</p>
        <p style={{ margin: 0 }}>Falls die Verarbeitung personenbezogene Daten betrifft, aus denen die rassische oder ethnische Herkunft, politische Meinungen, religiöse oder weltanschauliche Überzeugungen oder die Gewerkschaftszugehörigkeit hervorgehen, oder die genetische Daten oder biometrische Daten zum Zweck der eindeutigen Identifizierung einer natürlichen Person, Daten über die Gesundheit, das Sexualleben oder die sexuelle Ausrichtung einer Person oder Daten über strafrechtliche Verurteilungen und Straftaten enthalten (im Folgenden „sensible Daten“), wendet der Auftragsverarbeiter spezielle Beschränkungen und/oder zusätzlichen Garantien an.</p>
        <p style={{ margin: "8px 0 0", fontWeight: 600 }}>7.6. Dokumentation und Einhaltung der Klauseln</p>
        <L>
          <li style={li}>Die Parteien müssen die Einhaltung dieser Klauseln nachweisen können.</li>
          <li style={li}>Der Auftragsverarbeiter bearbeitet Anfragen des Verantwortlichen bezüglich der Verarbeitung von Daten gemäß diesen Klauseln umgehend und in angemessener Weise.</li>
          <li style={li}>Der Auftragsverarbeiter stellt dem Verantwortlichen alle Informationen zur Verfügung, die für den Nachweis der Einhaltung der in diesen Klauseln festgelegten und unmittelbar aus der Verordnung (EU) 2016/679 und/oder der Verordnung (EU) 2018/1725 hervorgehenden Pflichten erforderlich sind. Auf Verlangen des Verantwortlichen gestattet der Auftragsverarbeiter ebenfalls die Prüfung der unter diese Klauseln fallenden Verarbeitungstätigkeiten in angemessenen Abständen oder bei Anzeichen für eine Nichteinhaltung und trägt zu einer solchen Prüfung bei. Bei der Entscheidung über eine Überprüfung oder Prüfung kann der Verantwortliche einschlägige Zertifizierungen des Auftragsverarbeiters berücksichtigen.</li>
          <li style={li}>Der Verantwortliche kann die Prüfung selbst durchführen oder einen unabhängigen Prüfer beauftragen. Die Prüfungen können auch Inspektionen in den Räumlichkeiten oder physischen Einrichtungen des Auftragsverarbeiters umfassen und werden gegebenenfalls mit angemessener Vorankündigung durchgeführt.</li>
          <li style={li}>Die Parteien stellen der/den zuständigen Aufsichtsbehörde(n) die in dieser Klausel genannten Informationen, einschließlich der Ergebnisse von Prüfungen, auf Anfrage zur Verfügung.</li>
        </L>
        <p style={{ margin: "8px 0 0", fontWeight: 600 }}>7.7. Einsatz von Unterauftragsverarbeitern</p>
        <L>
          <li style={li}>ALLGEMEINE SCHRIFTLICHE GENEHMIGUNG: Der Auftragsverarbeiter besitzt die allgemeine Genehmigung des Verantwortlichen für die Beauftragung von Unterauftragsverarbeitern, die in einer vereinbarten Liste aufgeführt sind. Der Auftragsverarbeiter unterrichtet den Verantwortlichen mindestens 14 Tage im Voraus ausdrücklich in schriftlicher Form über alle beabsichtigten Änderungen dieser Liste durch Hinzufügen oder Ersetzen von Unterauftragsverarbeitern und räumt dem Verantwortlichen damit ausreichend Zeit ein, um vor der Beauftragung des/der betreffenden Unterauftragsverarbeiter/s Einwände gegen diese Änderungen erheben zu können. Der Auftragsverarbeiter stellt dem Verantwortlichen die erforderlichen Informationen zur Verfügung, damit dieser sein Widerspruchsrecht ausüben kann.</li>
          <li style={li}>Beauftragt der Auftragsverarbeiter einen Unterauftragsverarbeiter mit der Durchführung bestimmter Verarbeitungstätigkeiten (im Auftrag des Verantwortlichen), so muss diese Beauftragung im Wege eines Vertrags erfolgen, der dem Unterauftragsverarbeiter im Wesentlichen dieselben Datenschutzpflichten auferlegt wie diejenigen, die für den Auftragsverarbeiter gemäß diesen Klauseln gelten. Der Auftragsverarbeiter stellt sicher, dass der Unterauftragsverarbeiter die Pflichten erfüllt, denen der Auftragsverarbeiter entsprechend diesen Klauseln und gemäß der Verordnung (EU) 2016/679 und/oder der Verordnung (EU) 2018/1725 unterliegt.</li>
          <li style={li}>Der Auftragsverarbeiter stellt dem Verantwortlichen auf dessen Verlangen eine Kopie einer solchen Untervergabevereinbarung und etwaiger späterer Änderungen zur Verfügung. Soweit es zum Schutz von Geschäftsgeheimnissen oder anderen vertraulichen Informationen, einschließlich personenbezogener Daten notwendig ist, kann der Auftragsverarbeiter den Wortlaut der Vereinbarung vor der Weitergabe einer Kopie unkenntlich machen.</li>
          <li style={li}>Der Auftragsverarbeiter haftet gegenüber dem Verantwortlichen in vollem Umfang dafür, dass der Unterauftragsverarbeiter seinen Pflichten gemäß dem mit dem Auftragsverarbeiter geschlossenen Vertrag nachkommt. Der Auftragsverarbeiter benachrichtigt den Verantwortlichen, wenn der Unterauftragsverarbeiter seine vertraglichen Pflichten nicht erfüllt.</li>
          <li style={li}>Der Auftragsverarbeiter vereinbart mit dem Unterauftragsverarbeiter eine Drittbegünstigtenklausel, wonach der Verantwortliche – im Falle, dass der Auftragsverarbeiter faktisch oder rechtlich nicht mehr besteht oder zahlungsunfähig ist – das Recht hat, den Untervergabevertrag zu kündigen und den Unterauftragsverarbeiter anzuweisen, die personenbezogenen Daten zu löschen oder zurückzugeben.</li>
        </L>
        <p style={{ margin: "8px 0 0", fontWeight: 600 }}>7.8. Internationale Datenübermittlungen</p>
        <L>
          <li style={li}>Jede Übermittlung von Daten durch den Auftragsverarbeiter an ein Drittland oder eine internationale Organisation erfolgt ausschließlich auf der Grundlage dokumentierter Weisungen des Verantwortlichen oder zur Einhaltung einer speziellen Bestimmung nach dem Unionsrecht oder dem Recht eines Mitgliedstaats, dem der Auftragsverarbeiter unterliegt, und muss mit Kapitel V der Verordnung (EU) 2016/679 oder der Verordnung (EU) 2018/1725 im Einklang stehen.</li>
          <li style={li}>Der Verantwortliche erklärt sich damit einverstanden, dass in Fällen, in denen der Auftragsverarbeiter einen Unterauftragsverarbeiter gemäß Klausel 7.7 für die Durchführung bestimmter Verarbeitungstätigkeiten (im Auftrag des Verantwortlichen) in Anspruch nimmt und diese Verarbeitungstätigkeiten eine Übermittlung personenbezogener Daten im Sinne von Kapitel V der Verordnung (EU) 2016/679 beinhalten, der Auftragsverarbeiter und der Unterauftragsverarbeiter die Einhaltung von Kapitel V der Verordnung (EU) 2016/679 sicherstellen können, indem sie Standardvertragsklauseln verwenden, die von der Kommission gemäß Artikel 46 Absatz 2 der Verordnung (EU) 2016/679 erlassen wurden, sofern die Voraussetzungen für die Anwendung dieser Standardvertragsklauseln erfüllt sind.</li>
        </L>
        <H>Klausel 8 – Unterstützung des Verantwortlichen</H>
        <L>
          <li style={li}>Der Auftragsverarbeiter unterrichtet den Verantwortlichen unverzüglich über jeden Antrag, den er von der betroffenen Person erhalten hat. Er beantwortet den Antrag nicht selbst, es sei denn, er wurde vom Verantwortlichen dazu ermächtigt.</li>
          <li style={li}>Unter Berücksichtigung der Art der Verarbeitung unterstützt der Auftragsverarbeiter den Verantwortlichen bei der Erfüllung von dessen Pflicht, Anträge betroffener Personen auf Ausübung ihrer Rechte zu beantworten. Bei der Erfüllung seiner Pflichten gemäß den Buchstaben a und b befolgt der Auftragsverarbeiter die Weisungen des Verantwortlichen.</li>
          <li style={li}>Abgesehen von der Pflicht des Auftragsverarbeiters, den Verantwortlichen gemäß Klausel 8 Buchstabe b zu unterstützen, unterstützt der Auftragsverarbeiter unter Berücksichtigung der Art der Datenverarbeitung und der ihm zur Verfügung stehenden Informationen den Verantwortlichen zudem bei der Einhaltung der folgenden Pflichten:
            <N>
              <li style={li}>Pflicht zur Durchführung einer Abschätzung der Folgen der vorgesehenen Verarbeitungsvorgänge für den Schutz personenbezogener Daten (im Folgenden „Datenschutz-Folgenabschätzung“), wenn eine Form der Verarbeitung voraussichtlich ein hohes Risiko für die Rechte und Freiheiten natürlicher Personen zur Folge hat;</li>
              <li style={li}>Pflicht zur Konsultation der zuständigen Aufsichtsbehörde(n) vor der Verarbeitung, wenn aus einer Datenschutz-Folgenabschätzung hervorgeht, dass die Verarbeitung ein hohes Risiko zur Folge hätte, sofern der Verantwortliche keine Maßnahmen zur Eindämmung des Risikos trifft;</li>
              <li style={li}>Pflicht zur Gewährleistung, dass die personenbezogenen Daten sachlich richtig und auf dem neuesten Stand sind, indem der Auftragsverarbeiter den Verantwortlichen unverzüglich unterrichtet, wenn er feststellt, dass die von ihm verarbeiteten personenbezogenen Daten unrichtig oder veraltet sind;</li>
              <li style={li}>Verpflichtungen gemäß Artikel 32 der Verordnung (EU) 2016/679.</li>
            </N>
          </li>
          <li style={li}>Die Parteien legen in Anhang III die geeigneten technischen und organisatorischen Maßnahmen zur Unterstützung des Verantwortlichen durch den Auftragsverarbeiter bei der Anwendung dieser Klausel sowie den Anwendungsbereich und den Umfang der erforderlichen Unterstützung fest.</li>
        </L>
        <H>Klausel 9 – Meldung von Verletzungen des Schutzes personenbezogener Daten</H>
        <p style={{ margin: 0 }}>Im Falle einer Verletzung des Schutzes personenbezogener Daten arbeitet der Auftragsverarbeiter mit dem Verantwortlichen zusammen und unterstützt ihn entsprechend, damit der Verantwortliche seinen Verpflichtungen gemäß den Artikeln 33 und 34 der Verordnung (EU) 2016/679 oder gegebenenfalls den Artikeln 34 und 35 der Verordnung (EU) 2018/1725 nachkommen kann, wobei der Auftragsverarbeiter die Art der Verarbeitung und die ihm zur Verfügung stehenden Informationen berücksichtigt.</p>
        <p style={{ margin: "8px 0 0", fontWeight: 600 }}>9.1. Verletzung des Schutzes der vom Verantwortlichen verarbeiteten Daten</p>
        <p style={{ margin: 0 }}>Im Falle einer Verletzung des Schutzes personenbezogener Daten im Zusammenhang mit den vom Verantwortlichen verarbeiteten Daten unterstützt der Auftragsverarbeiter den Verantwortlichen wie folgt:</p>
        <L>
          <li style={li}>bei der unverzüglichen Meldung der Verletzung des Schutzes personenbezogener Daten an die zuständige(n) Aufsichtsbehörde(n), nachdem dem Verantwortlichen die Verletzung bekannt wurde, sofern relevant (es sei denn, die Verletzung des Schutzes personenbezogener Daten führt voraussichtlich nicht zu einem Risiko für die persönlichen Rechte und Freiheiten natürlicher Personen);</li>
          <li style={li}>bei der Einholung der folgenden Informationen, die gemäß Artikel 33 Absatz 3 der Verordnung (EU) 2016/679 in der Meldung des Verantwortlichen anzugeben sind, wobei diese Informationen mindestens Folgendes umfassen müssen:
            <N>
              <li style={li}>die Art der personenbezogenen Daten, soweit möglich, mit Angabe der Kategorien und der ungefähren Zahl der betroffenen Personen sowie der Kategorien und der ungefähren Zahl der betroffenen personenbezogenen Datensätze;</li>
              <li style={li}>die wahrscheinlichen Folgen der Verletzung des Schutzes personenbezogener Daten;</li>
              <li style={li}>die vom Verantwortlichen ergriffenen oder vorgeschlagenen Maßnahmen zur Behebung der Verletzung des Schutzes personenbezogener Daten und gegebenenfalls Maßnahmen zur Abmilderung ihrer möglichen nachteiligen Auswirkungen.</li>
            </N>
            Wenn und soweit nicht alle diese Informationen zur gleichen Zeit bereitgestellt werden können, enthält die ursprüngliche Meldung die zu jenem Zeitpunkt verfügbaren Informationen, und weitere Informationen werden, sobald sie verfügbar sind, anschließend ohne unangemessene Verzögerung bereitgestellt;
          </li>
          <li style={li}>bei der Einhaltung der Pflicht gemäß Artikel 34 der Verordnung (EU) 2016/679, die betroffene Person unverzüglich von der Verletzung des Schutzes personenbezogener Daten zu benachrichtigen, wenn diese Verletzung voraussichtlich ein hohes Risiko für die Rechte und Freiheiten natürlicher Personen zur Folge hat.</li>
        </L>
        <p style={{ margin: "8px 0 0", fontWeight: 600 }}>9.2. Verletzung des Schutzes der vom Auftragsverarbeiter verarbeiteten Daten</p>
        <p style={{ margin: 0 }}>Im Falle einer Verletzung des Schutzes personenbezogener Daten im Zusammenhang mit den vom Auftragsverarbeiter verarbeiteten Daten meldet der Auftragsverarbeiter diese dem Verantwortlichen unverzüglich, nachdem ihm die Verletzung bekannt wurde. Diese Meldung muss zumindest folgende Informationen enthalten:</p>
        <L>
          <li style={li}>eine Beschreibung der Art der Verletzung (möglichst unter Angabe der Kategorien und der ungefähren Zahl der betroffenen Personen und der ungefähren Zahl der betroffenen Datensätze);</li>
          <li style={li}>Kontaktdaten einer Anlaufstelle, bei der weitere Informationen über die Verletzung des Schutzes personenbezogener Daten eingeholt werden können;</li>
          <li style={li}>die voraussichtlichen Folgen und die ergriffenen oder vorgeschlagenen Maßnahmen zur Behebung der Verletzung des Schutzes personenbezogener Daten, einschließlich Maßnahmen zur Abmilderung ihrer möglichen nachteiligen Auswirkungen.</li>
        </L>
        <p style={{ margin: "6px 0 0" }}>Wenn und soweit nicht alle diese Informationen zur gleichen Zeit bereitgestellt werden können, enthält die ursprüngliche Meldung die zu jenem Zeitpunkt verfügbaren Informationen, und weitere Informationen werden, sobald sie verfügbar sind, anschließend ohne unangemessene Verzögerung bereitgestellt.</p>
        <p style={{ margin: "6px 0 0" }}>Die Parteien legen in Anhang III alle sonstigen Angaben fest, die der Auftragsverarbeiter zur Verfügung zu stellen hat, um den Verantwortlichen bei der Erfüllung von dessen Pflichten gemäß Artikel 33 und 34 der Verordnung (EU) 2016/679 zu unterstützen.</p>
      </Section>

      <Section title="Abschnitt III – Schlussbestimmungen">
        <H>Klausel 10 – Verstöße gegen die Klauseln und Beendigung des Vertrags</H>
        <L>
          <li style={li}>Falls der Auftragsverarbeiter seinen Pflichten gemäß diesen Klauseln nicht nachkommt, kann der Verantwortliche – unbeschadet der Bestimmungen der Verordnung (EU) 2016/679 und/oder der Verordnung (EU) 2018/1725 – den Auftragsverarbeiter anweisen, die Verarbeitung personenbezogener Daten auszusetzen, bis er diese Klauseln einhält oder der Vertrag beendet ist. Der Auftragsverarbeiter unterrichtet den Verantwortlichen unverzüglich, wenn er aus welchen Gründen auch immer nicht in der Lage ist, diese Klauseln einzuhalten.</li>
          <li style={li}>Der Verantwortliche ist berechtigt, den Vertrag zu kündigen, soweit er die Verarbeitung personenbezogener Daten gemäß diesen Klauseln betrifft, wenn
            <N>
              <li style={li}>der Verantwortliche die Verarbeitung personenbezogener Daten durch den Auftragsverarbeiter gemäß Buchstabe a ausgesetzt hat und die Einhaltung dieser Klauseln nicht innerhalb einer angemessenen Frist, in jedem Fall aber innerhalb eines Monats nach der Aussetzung, wiederhergestellt wurde;</li>
              <li style={li}>der Auftragsverarbeiter in erheblichem Umfang oder fortdauernd gegen diese Klauseln verstößt oder seine Verpflichtungen gemäß der Verordnung (EU) 2016/679 und/oder der Verordnung (EU) 2018/1725 nicht erfüllt;</li>
              <li style={li}>der Auftragsverarbeiter einer bindenden Entscheidung eines zuständigen Gerichts oder der zuständigen Aufsichtsbehörde(n), die seine Pflichten gemäß diesen Klauseln, der Verordnung (EU) 2016/679 und/oder der Verordnung (EU) 2018/1725 zum Gegenstand hat, nicht nachkommt.</li>
            </N>
          </li>
          <li style={li}>Der Auftragsverarbeiter ist berechtigt, den Vertrag zu kündigen, soweit er die Verarbeitung personenbezogener Daten gemäß diesen Klauseln betrifft, wenn der Verantwortliche auf der Erfüllung seiner Anweisungen besteht, nachdem er vom Auftragsverarbeiter darüber in Kenntnis gesetzt wurde, dass seine Anweisungen gegen geltende rechtliche Anforderungen gemäß Klausel 7.1 Buchstabe b verstoßen.</li>
          <li style={li}>Nach Beendigung des Vertrags löscht der Auftragsverarbeiter nach Wahl des Verantwortlichen alle im Auftrag des Verantwortlichen verarbeiteten personenbezogenen Daten und bescheinigt dem Verantwortlichen, dass dies erfolgt ist, oder er gibt alle personenbezogenen Daten an den Verantwortlichen zurück und löscht bestehende Kopien, sofern nicht nach dem Unionsrecht oder dem Recht der Mitgliedstaaten eine Verpflichtung zur Speicherung der personenbezogenen Daten besteht. Bis zur Löschung oder Rückgabe der Daten gewährleistet der Auftragsverarbeiter weiterhin die Einhaltung dieser Klauseln.</li>
        </L>
      </Section>

      <Section title="Anhang I – Liste der Parteien">
        <p style={{ margin: "0 0 8px" }}><b>Verantwortlicher:</b> das Unternehmen, für das der Zugang zu Dienstigo eingerichtet ist (Name und Anschrift wie bei der Einrichtung angegeben). Kontaktperson: die Person mit der Rolle „Inhaber“ in Dienstigo, erreichbar über deren hinterlegte E-Mail-Adresse. Zustimmung: elektronisch im Dienstigo-Konto des Inhabers; Datum, Konto und Fassung werden gespeichert.</p>
        <p style={{ margin: 0 }}><b>Auftragsverarbeiter:</b> Mehran Eslami, Dienstigo, Bohlkamp 21, 23564 Lübeck, Deutschland. Kontaktperson: Mehran Eslami, Inhaber, info@dienstigo.de, +49 176 34340216. Ein Datenschutzbeauftragter ist nicht benannt (keine gesetzliche Pflicht). Zustimmung: durch Bereitstellung dieses Vertrags in Dienstigo.</p>
      </Section>

      <Section title="Anhang II – Beschreibung der Verarbeitung">
        <p style={{ margin: "0 0 8px" }}><b>Kategorien betroffener Personen:</b> Beschäftigte des Verantwortlichen (Mitarbeitende, Schichtplaner, Leitung, Inhaber).</p>
        <p style={{ margin: "0 0 8px" }}><b>Kategorien personenbezogener Daten:</b> Name, Personalnummer, E-Mail-Adresse und Rolle von Benutzerkonten; vertragliche Arbeitszeit, Urlaubsanspruch; Dienstpläne, Schichten und Einsatzorte; Wünsche und Anträge (zum Beispiel Urlaub); Abwesenheiten mit ihrer Art (zum Beispiel Urlaub, Krankheit, Mutterschutz, Elternzeit), ohne Diagnosen; Arbeitszeiten (Kommen, Gehen, Pausen), Korrekturen mit Begründung, Stundenkonten, Überstunden und Zuschläge; Kennungen von Chipkarten und Terminals; persönliche PIN (nur als Hash gespeichert); bei eingeschalteter Funktion „Mobil stempeln“ der Standort zum Zeitpunkt des Stempelns; technische Anmeldedaten (Zeitpunkt der letzten Anmeldung).</p>
        <p style={{ margin: "0 0 8px" }}><b>Sensible Daten und Garantien:</b> Abwesenheiten wegen Krankheit, Mutterschutz oder Elternzeit können Rückschlüsse auf die Gesundheit zulassen. Es werden keine Diagnosen gespeichert. Anträge, Krankmeldungen und Zeitkonten verwalten nur Inhaber, Leitung und Schichtplaner der Firma; Mitarbeitende sehen davon nur ihre eigenen Einträge. Der Zugriff ist technisch auf die eigene Firma beschränkt. In der Testphase dürfen keine echten Daten und damit keine sensiblen Daten eingegeben werden.</p>
        <p style={{ margin: "0 0 8px" }}><b>Art der Verarbeitung:</b> Speichern, Anzeigen, Berechnen (Dienstpläne, Arbeitszeiten, Stundenkonten), Drucken und Exportieren, Versand von System-E-Mails (zum Beispiel Zugangslinks), Löschen.</p>
        <p style={{ margin: "0 0 8px" }}><b>Zweck:</b> Bereitstellung der Software Dienstigo für den Verantwortlichen zur Dienstplanung, Zeiterfassung und Erstellung von Stundenzetteln, einschließlich Betrieb, Sicherung und Support auf Anfrage des Verantwortlichen.</p>
        <p style={{ margin: 0 }}><b>Dauer:</b> für die Dauer der Nutzung von Dienstigo (Testphase oder Vertrag). Danach gilt Klausel 10 Buchstabe d. Nach einer Testphase ohne Vertrag werden die Daten spätestens 60 Tage nach deren Ende gelöscht. Sicherungskopien bei den Hostern werden nach deren Fristen überschrieben. Für Unterauftragsverarbeiter gelten Gegenstand, Art und Dauer wie oben, beschränkt auf ihre Teilleistung (siehe Anhang IV).</p>
      </Section>

      <Section title="Anhang III – Technische und organisatorische Maßnahmen">
        <p style={{ margin: "0 0 8px" }}><b>Verschlüsselung:</b> Alle Verbindungen laufen ausschließlich verschlüsselt über HTTPS (TLS, mit HSTS). Die Datenbank ist beim Hoster verschlüsselt gespeichert. PINs werden nur als Hash (bcrypt) gespeichert; Passwörter verwaltet der Anmeldedienst und speichert sie nur als Hash.</p>
        <p style={{ margin: "0 0 8px" }}><b>Serverstandort:</b> Datenbank in Frankfurt am Main (Region eu-central-1); Serverfunktionen in Frankfurt am Main (Region fra1).</p>
        <p style={{ margin: "0 0 8px" }}><b>Identifizierung und Berechtigung:</b> persönliche Benutzerkonten mit E-Mail und Passwort; neue Konten müssen beim ersten Anmelden ein eigenes Passwort wählen. Rollen (Inhaber, Leitung, Schichtplaner, Mitarbeitende) begrenzen, wer was sehen und ändern darf. Jede Datenbanktabelle ist durch Zugriffsregeln (Row Level Security) auf die eigene Firma beschränkt; Mitarbeitende sehen den veröffentlichten Dienstplan ihres Teams, aber keine Zeiten, Anträge oder Konten anderer Personen. Nicht angemeldete Besucher haben keinen Zugriff auf Daten.</p>
        <p style={{ margin: "0 0 8px" }}><b>Zugriff des Anbieters:</b> nur der Auftragsverarbeiter selbst als Plattform-Administrator, nur soweit für Betrieb und Support nötig. Administrative Aktionen werden mit Person, Zeit und Firma protokolliert. Der Generalschlüssel der Datenbank liegt nur auf dem Server, nie im Browser.</p>
        <p style={{ margin: "0 0 8px" }}><b>Integrität und Protokollierung:</b> erfasste Arbeitszeiten können nicht überschrieben werden; Korrekturen sind nur mit Begründung möglich und bleiben nachvollziehbar. Freigaben von Dienstplänen werden mit Version gespeichert.</p>
        <p style={{ margin: "0 0 8px" }}><b>Schutz der Anwendung:</b> Sicherheits-Header (Content-Security-Policy, Schutz vor Einbettung in fremde Seiten), Begrenzung von Anmelde- und PIN-Fehlversuchen, Prüfung aller Eingaben auf dem Server.</p>
        <p style={{ margin: "0 0 8px" }}><b>Verfügbarkeit und Wiederherstellung:</b> Betrieb bei professionellen Rechenzentrumsanbietern mit eigener physischer Sicherung; Datensicherungen im Rahmen des beim Datenbank-Hoster gebuchten Tarifs. Einzelheiten auf Anfrage.</p>
        <p style={{ margin: "0 0 8px" }}><b>Datenminimierung:</b> keine Werbe- oder Analyse-Tracker; es werden nur Daten verarbeitet, die für die Funktionen nötig sind. IP-Adressen bei Demo-Anfragen werden nur als verschlüsselter Hash gespeichert.</p>
        <p style={{ margin: "0 0 8px" }}><b>Unterstützung des Verantwortlichen:</b> Der Inhaber kann Daten seiner Beschäftigten in Dienstigo ansehen, drucken und exportieren sowie Konten entfernen; weitere Auskünfte, Berichtigungen oder Löschungen nimmt der Auftragsverarbeiter auf Weisung vor.</p>
        <p style={{ margin: "0 0 8px" }}><b>Meldung von Vorfällen:</b> Der Auftragsverarbeiter meldet Verletzungen des Schutzes personenbezogener Daten per E-Mail an den Inhaber, möglichst innerhalb von 48 Stunden nach Kenntnis.</p>
        <p style={{ margin: 0 }}><b>Überprüfung:</b> Der Auftragsverarbeiter prüft diese Maßnahmen mindestens einmal jährlich und bei jeder wesentlichen Änderung der Software oder der Unterauftragsverarbeiter.</p>
      </Section>

      <Section title="Anhang IV – Liste der Unterauftragsverarbeiter (vereinbarte Liste zu Klausel 7.7)">
        <p style={{ margin: "0 0 8px" }}><b>1. Supabase, Inc. (USA)</b> – Datenbank, Anmeldung und Speicherung aller Anwendungsdaten. Ort der Verarbeitung: Rechenzentrum in Frankfurt am Main (Amazon Web Services, Region eu-central-1). Da der Anbieter seinen Sitz in den USA hat, ist ein Zugriff aus den USA nicht ausgeschlossen; Grundlage: Standardvertragsklauseln der EU-Kommission (Durchführungsbeschluss (EU) 2021/914) im Auftragsverarbeitungsvertrag von Supabase.</p>
        <p style={{ margin: "0 0 8px" }}><b>2. Vercel Inc. (USA)</b> – Betrieb der Webanwendung und der Serverfunktionen. Ort der Verarbeitung: Serverfunktionen in Frankfurt am Main (Region fra1); Auslieferung der Seiten über ein weltweites Netz. Grundlage: Zertifizierung nach dem EU-US Data Privacy Framework.</p>
        <p style={{ margin: 0 }}><b>3. IONOS SE, Elgendorfer Straße 57, 56410 Montabaur, Deutschland</b> – Versand und Empfang von E-Mails (zum Beispiel Zugangslinks und Anfragen). Ort der Verarbeitung: Deutschland/EU.</p>
      </Section>
    </LegalPage>
  );
}
