// Name pools by culture, for the fighters the world generates. Spaces inside a
// name are written as underscores.

import type { Rng } from "../core/rng";
import type { Sex } from "./divisions";

interface Pool {
  m: string[];
  f: string[];
  l: string[];
}

const P = (m: string, f: string, l: string): Pool => ({
  m: m.split(" ").map((s) => s.replace(/_/g, " ")),
  f: f.split(" ").map((s) => s.replace(/_/g, " ")),
  l: l.split(" ").map((s) => s.replace(/_/g, " ")),
});

export const NAME_POOLS: Record<string, Pool> = {
  anglo: P(
    "James Michael Tyler Jake Cody Brandon Kyle Justin Chris Matt Ryan Josh Jordan Austin Dustin Derrick Bryce Mason Hunter Colby Chase Dalton Cole Logan Nate Trevor Wyatt Jalen Malik Marcus Darius Isaiah Andre Tre Devin Shane Garrett Kevin Sean Liam Callum Harry Jack Tom Ollie Lewis Jamie Kai",
    "Sarah Jessica Ashley Kayla Taylor Megan Brittany Rachel Amanda Lauren Paige Jasmine Raquel Molly Chloe Holly Erin Kelsey Morgan Jade Brooke",
    "Smith Johnson Williams Brown Jones Miller Davis Wilson Anderson Taylor Thomas Moore Martin Jackson Thompson White Harris Clark Lewis Walker Hall Allen Young King Wright Hill Scott Green Baker Adams Nelson Carter Mitchell Roberts Turner Phillips Campbell Parker Evans Edwards Collins Stewart Morris Rogers Reed Cook Bell Cooper Ward Brooks Hughes Price Bennett Wood Barnes Foster Bryant Russell Griffin Hayes Myers Ford Hamilton Graham Sullivan Wallace Woods Cole West Jordan Owens Fisher Ellis Harrison Gibson Marshall Pierce Black Dunn Shaw Holmes Rice Hunt Palmer Wells Webb Mills Knight Lane Fox Blake"
  ),
  irish: P(
    "Conor Sean Liam Cian Darragh Oisin Padraig Eoin Ciaran Declan Rory Niall Shane Aaron Ronan Kieran Colm Brendan Fionn Donal",
    "Aoife Siobhan Niamh Ciara Roisin Orla Sinead Caoimhe Grainne Saoirse",
    "Murphy Kelly O'Sullivan Walsh O'Brien Byrne Ryan O'Connor O'Neill Reilly Doyle McCarthy Gallagher Doherty Kennedy Lynch Murray Quinn Moore McLoughlin Carroll Connolly Daly Brennan Duffy Kavanagh Nolan Fitzgerald Maguire Keane Burke Hogan Flynn"
  ),
  hispanic: P(
    "José Luis Carlos Juan Miguel Jorge Alejandro Diego Javier Fernando Ricardo Eduardo Raúl Sergio Daniel Adrián Óscar Marco Iván Héctor Manuel Rodrigo Andrés Ángel Brandon Kevin Erick Edgar Yair Alexis Brayan Joel Christian",
    "María Ana Lucía Daniela Valeria Gabriela Andrea Fernanda Paola Alexa Ximena Karla Mariana Lupita Diana Irene Yazmin",
    "García Rodríguez Martínez Hernández López González Pérez Sánchez Ramírez Torres Flores Rivera Gómez Díaz Reyes Morales Cruz Ortiz Gutiérrez Chávez Ramos Ruiz Mendoza Álvarez Castillo Jiménez Moreno Romero Herrera Medina Aguilar Vargas Castro Guzmán Rojas Salazar Ortega Delgado Vega Ríos Navarro Peña Campos Cabrera Fuentes Carrillo Contreras Sandoval Espinoza Figueroa Valdez Acosta Marín"
  ),
  spanish: P(
    "Alejandro Pablo Sergio Javier David Daniel Adrián Álvaro Hugo Marcos Iván Raúl Joel Iker Unai Aitor Rubén Víctor Óscar Ilia Mario Rafael",
    "Lucía Laura Marta Paula Sara Andrea Carmen Elena Irene Nerea",
    "García Fernández González Rodríguez López Martínez Sánchez Pérez Gómez Martín Jiménez Ruiz Hernández Díaz Moreno Muñoz Álvarez Romero Alonso Navarro Torres Domínguez Gil Vázquez Serrano Ramos Blanco Molina Ortega Delgado Castro Rubio Marín Iglesias Medina Garrido"
  ),
  brazil: P(
    "João Lucas Gabriel Rafael Matheus Pedro Gustavo Felipe Bruno Thiago Diego Rodrigo Leonardo Vinicius Caio Igor Wellington Renato Marcos Jailton Charles Deiveson Gilbert Edson Alex Thiago Jorge Ronaldo Rogério Davi Ariane Jean Michel Elves Cláudio Wanderlei",
    "Amanda Ana Juliana Larissa Bruna Mariana Beatriz Camila Jéssica Karine Taila Viviane Ketlen Tainara Priscila",
    "Silva Santos Oliveira Souza Rodrigues Ferreira Alves Pereira Lima Gomes Costa Ribeiro Martins Carvalho Almeida Lopes Soares Fernandes Vieira Barbosa Rocha Dias Nascimento Andrade Moreira Nunes Marques Machado Mendes Freitas Cardoso Ramos Gonçalves Santana Teixeira Moraes Borges Araújo Pinheiro Cavalcante Monteiro Medeiros Batista Brandão Queiroz Neves Pimenta Prates"
  ),
  french: P(
    "Lucas Hugo Théo Nathan Mathis Enzo Tom Louis Gabriel Jules Arthur Antoine Maxime Alexandre Kevin Quentin Romain Thomas Baptiste Yanis Cyril Benoît Florian Morgan Manon Mickaël Sébastien Damien",
    "Manon Emma Léa Chloé Camille Sarah Inès Clara Anaïs Lucie Océane Laura",
    "Martin Bernard Dubois Thomas Robert Richard Petit Durand Leroy Moreau Simon Laurent Lefebvre Michel Garcia David Bertrand Roux Vincent Fournier Morel Girard André Lefèvre Mercier Dupont Lambert Bonnet François Martinez Legrand Garnier Faure Rousseau Blanc Guerin Muller Henry Roussel Nicolas Perrin Morin Mathieu Clement Gauthier Dumont Lopez Fontaine Chevalier Robin"
  ),
  german: P(
    "Lukas Leon Finn Jonas Elias Noah Paul Ben Felix Maximilian Luca Niklas Tim Jan Tobias Florian Dennis Kevin Marcel Patrick Daniel Christian Sebastian Fabian Dominik Sascha",
    "Lena Anna Laura Lea Hannah Sarah Julia Lisa Marie Sophie Jana Katharina",
    "Müller Schmidt Schneider Fischer Weber Meyer Wagner Becker Schulz Hoffmann Schäfer Koch Bauer Richter Klein Wolf Schröder Neumann Schwarz Zimmermann Braun Krüger Hofmann Hartmann Lange Schmitt Werner Krause Meier Lehmann Schmid Schulze Maier Köhler Herrmann König Walter Mayer Huber Kaiser Fuchs Peters Lang Scholz Möller Weiß Jung Hahn Vogel Friedrich Keller Günther Frank Berger Winkler Roth Beck Lorenz Baumann Franke Albrecht"
  ),
  dutch: P(
    "Daan Sem Lucas Levi Finn Milan Jesse Bram Thijs Ruben Lars Stijn Tim Jeroen Niels Sven Bas Rico Melvin Gegard Alistair Siyar",
    "Emma Julia Sophie Lotte Fleur Anna Sanne Lisa Iris Noa",
    "de_Jong Jansen de_Vries van_den_Berg van_Dijk Bakker Janssen Visser Smit Meijer de_Boer Mulder de_Groot Bos Vos Peters Hendriks van_Leeuwen Dekker Brouwer de_Wit Dijkstra Smits de_Graaf van_der_Meer van_der_Linden Kok Jacobs de_Haan Vermeulen van_den_Heuvel van_der_Veen van_den_Broek de_Bruijn de_Bruin van_der_Heijden Schouten van_Beek Willems Hoekstra"
  ),
  nordic: P(
    "Erik Lars Anders Johan Karl Nils Oskar Magnus Henrik Mikael Jonas Fredrik Emil Viktor Axel Gunnar Jesper Rasmus Mathias Mads Alexander Khalil Gunni",
    "Emma Sofia Maja Elin Ida Astrid Linnea Frida Johanna Hanna Saga",
    "Andersson Johansson Karlsson Nilsson Eriksson Larsson Olsson Persson Svensson Gustafsson Pettersson Jonsson Hansen Johansen Olsen Larsen Andersen Pedersen Nielsen Kristiansen Jensen Christensen Rasmussen Jørgensen Madsen Virtanen Korhonen Mäkinen Nieminen Mäkelä Hämäläinen Laine Lindqvist Berg Lund Strand Holm Dahl Nordin"
  ),
  italian: P(
    "Marco Luca Alessandro Andrea Matteo Lorenzo Francesco Davide Simone Federico Riccardo Gabriele Stefano Giuseppe Antonio Daniele Fabio Alessio Mattia Paolo Michele Mauro Carlo",
    "Giulia Chiara Sara Martina Francesca Federica Alessia Valentina Elisa Silvia",
    "Rossi Russo Ferrari Esposito Bianchi Romano Colombo Ricci Marino Greco Bruno Gallo Conti De_Luca Mancini Costa Giordano Rizzo Lombardi Moretti Barbieri Fontana Santoro Mariani Rinaldi Caruso Ferrara Galli Martini Leone Longo Gentile Martinelli Vitale Lombardo Serra Coppola De_Santis D'Angelo Marchetti Parisi Villa Conte Ferraro Ferri Fabbri Bianco Marini Grasso Valentini"
  ),
  greek: P(
    "Giorgos Dimitris Nikos Kostas Giannis Panagiotis Christos Vasilis Thanasis Michalis Stavros Alexandros Spyros Petros Lefteris",
    "Maria Eleni Katerina Sofia Georgia Ioanna Despina",
    "Papadopoulos Papadakis Georgiou Nikolaidis Karagiannis Vlachos Pappas Oikonomou Antoniou Dimitriou Konstantinidis Ioannidis Christodoulou Makris Alexiou Angelopoulos Theodorou Mavros Kostopoulos Raptis"
  ),
  russian: P(
    "Aleksandr Sergei Dmitri Andrei Alexei Ivan Mikhail Nikita Artem Roman Vladimir Pavel Maksim Denis Yevgeny Kirill Anton Vadim Oleg Igor Vladislav Ilya Vitaly Viktor Stanislav Yaroslav Bogdan Taras",
    "Anastasia Ekaterina Maria Olga Tatiana Natalia Irina Yulia Svetlana Viktoria Darya Polina Valentina",
    "Ivanov Smirnov Kuznetsov Popov Vasiliev Petrov Sokolov Mikhailov Novikov Fedorov Morozov Volkov Alekseev Lebedev Semenov Egorov Pavlov Kozlov Stepanov Nikolaev Orlov Andreev Makarov Nikitin Zakharov Zaitsev Solovyov Borisov Yakovlev Grigoriev Romanov Vorobyov Sergeev Kuzmin Frolov Aleksandrov Dmitriev Korolev Gusev Kiselev Ilyin Maksimov Polyakov Sorokin Vinogradov Kovalev Belov Medvedev Antonov Tarasov Zhukov Baranov Filippov Komarov Davydov Belyaev Gerasimov Bogdanov Osipov Sidorov Matveev Shevchenko Kovalenko Bondarenko Tkachenko Kravchenko"
  ),
  caucasus: P(
    "Magomed Islam Khabib Abubakar Shamil Zabit Gadzhi Ramazan Said Umar Rasul Akhmed Kamil Murad Arsen Ruslan Ibragim Khamzat Aslan Abdul Muslim Movsar Askar Rustam Zaurbek Alikhan Usman Tagir Gamzat Rashid Daud Amir Isa Akhmad Makhmud",
    "Aminat Patimat Madina Zalina Fatima Khadizhat Aishat Zarema",
    "Magomedov Abdulaev Gadzhiev Aliev Omarov Akhmedov Khasbulaev Nurmagomedov Makhachev Ramazanov Umarov Kurbanov Ismailov Gasanov Abakarov Rasulov Murtazaliev Dudaev Saidov Ibragimov Kadyrov Zaurbekov Yusupov Isaev Musaev Shikhsaidov Khalidov Gamzatov Magomedsharipov Daudov Batirov Akhmatov Eldarov Dzhabrailov Bagautinov Abdurakhmanov Mutalibov Salikhov Tagirov Gimbatov"
  ),
  polish: P(
    "Jakub Kacper Szymon Mateusz Michał Bartosz Wojciech Kamil Tomasz Paweł Piotr Krzysztof Łukasz Marcin Damian Adrian Mariusz Artur Rafał Daniel Maciej Przemysław Sebastian Mamed Grzegorz",
    "Joanna Karolina Agnieszka Natalia Aleksandra Katarzyna Magdalena Paulina Monika Weronika",
    "Nowak Kowalski Wiśniewski Wójcik Kowalczyk Kamiński Lewandowski Zieliński Szymański Woźniak Dąbrowski Kozłowski Jankowski Mazur Kwiatkowski Krawczyk Piotrowski Grabowski Nowakowski Pawłowski Michalski Nowicki Adamczyk Dudek Zając Wieczorek Jabłoński Król Majewski Olszewski Jaworski Wróbel Malinowski Pawlak Witkowski Walczak Stępień Górski Rutkowski Michalak Sikora Baran Duda Szewczyk Tomaszewski Pietrzak Marciniak Wróblewski Zalewski Jakubowski"
  ),
  czech: P(
    "Jiří Jan Petr Josef Pavel Martin Tomáš Jaroslav Miroslav Zdeněk Václav Michal Karel Lukáš David Jakub Ondřej Vojtěch Matěj Adam Filip Patrik Marek Jozef Peter",
    "Tereza Eliška Anna Adéla Natálie Lucie Kateřina Veronika Barbora Klára",
    "Novák Svoboda Novotný Dvořák Černý Procházka Kučera Veselý Horák Němec Pokorný Marek Pospíšil Hájek Jelínek Král Růžička Beneš Fiala Sedláček Doležal Zeman Kolář Navrátil Čermák Vaněk Urban Blažek Kříž Kovář Bartoš Vlček Polák Musil Kopecký Šimek Konečný Malý Holub Štěpánek Kadlec Dostál Soukup Mareš Moravec Vávra Prochazka Vémola Kincl"
  ),
  balkan: P(
    "Nikola Luka Marko Stefan Lazar Filip Milan Dragan Ivan Petar Aleksandar Miloš Nemanja Dušan Vuk Mirko Ante Josip Tomislav Damir Dino Armin Edin Haris Emir Amar Kenan Arben Florian Elvis",
    "Ana Milica Jelena Ivana Marija Sara Teodora Maja Elena Lejla",
    "Jovanović Petrović Nikolić Marković Đorđević Stojanović Ilić Stanković Pavlović Milošević Popović Kovačević Babić Horvat Kovač Marić Jurić Knežević Vuković Novak Božić Hodžić Hadžić Begić Delić Mehmedović Kurtović Hoxha Krasniqi Gashi Berisha Shala Ivanov Georgiev Dimitrov Petrov Todorov Stoyanov Kolev Nikolov"
  ),
  baltic: P(
    "Jonas Lukas Matas Mantas Tomas Darius Paulius Rokas Andrius Kęstutis Mindaugas Artūrs Jānis Kristaps Edgars Andris Rasmus Karl Martin Kaspar",
    "Ieva Gabija Austėja Laura Anna Līga Kristīne Kadri Liis",
    "Kazlauskas Jankauskas Petrauskas Stankevičius Vasiliauskas Žukauskas Butkus Paulauskas Urbonas Kavaliauskas Bērziņš Kalniņš Ozoliņš Jansons Liepiņš Krūmiņš Tamm Saar Sepp Mägi Kask Rebane Ilves Kukk"
  ),
  romanian: P(
    "Andrei Alexandru Mihai Ionuț Florin Cristian Adrian Gabriel Ștefan Daniel Bogdan Vlad Marius Răzvan Cătălin Sorin Costel Ion Dumitru Valentin",
    "Maria Elena Ioana Andreea Alexandra Cristina Mihaela Diana",
    "Popescu Ionescu Popa Pop Radu Dumitru Stoica Stan Gheorghe Matei Ciobanu Rusu Munteanu Constantin Moldovan Lazăr Florea Ene Dinu Marin Tudor Barbu Cristea Ungureanu Ciorbă Botnari Moraru Lungu"
  ),
  hungarian: P(
    "Bence Máté Levente Ádám Dávid Balázs Dániel Gergő Márk Tamás Zoltán László Attila Gábor Norbert Krisztián",
    "Anna Hanna Zsófia Réka Eszter Petra Viktória",
    "Nagy Kovács Tóth Szabó Horváth Varga Kiss Molnár Németh Farkas Balogh Papp Takács Juhász Lakatos Mészáros Oláh Simon Rácz Fekete"
  ),
  georgian: P(
    "Giorgi Davit Levan Nika Luka Merab Ilia Zurab Irakli Lasha Guram Tornike Shota Beka Revaz Saba Mamuka Goga Vakhtang Roman",
    "Nino Mariam Tamar Ana Salome Elene Natia",
    "Dvalishvili Beridze Kapanadze Gelashvili Maisuradze Tsiklauri Lomidze Kvaratskhelia Mamardashvili Abuladze Mikeladze Tsereteli Gogoladze Chikhladze Chkhaidze Zhvania Kharaishvili Topuria Natsvlishvili Kiknadze Mchedlidze Baratashvili Gvelesiani Margiev"
  ),
  armenian: P(
    "Armen Aram Arman Hayk Davit Tigran Narek Gor Vardan Karen Ashot Levon Artur Arsen Gevorg Sargis Hovhannes Vahe",
    "Ani Mariam Anahit Lilit Nare Gayane",
    "Hovhannisyan Harutyunyan Sargsyan Khachatryan Grigoryan Petrosyan Vardanyan Gevorgyan Karapetyan Mkrtchyan Ghazaryan Avetisyan Hakobyan Manukyan Asatryan Galstyan Arakelyan Davtyan Mamikonyan Simonyan"
  ),
  central: P(
    "Nurlan Yerlan Daniyar Arman Asu Zhalgas Bekzat Aibek Nursultan Azamat Timur Ruslan Sanzhar Shavkat Rustam Bakhodir Jasur Sherzod Ulugbek Otabek Makhmud Valijon Shokhrukh Alisher Kairat Ermek Erlan Bolat",
    "Aigerim Dana Madina Aruzhan Kamila Dilnoza Gulnara Asel",
    "Nurmukhambetov Almabayev Zhumagulov Aliyev Rakhmonov Nurlanov Seitkali Sultanov Tokhtarov Akhmetov Bekov Abdurakhimov Kurbanov Tursunov Yusupov Karimov Rahimov Ergashev Nazarov Saidov Mirzaev Abdullaev Ismoilov Sadykov Ibraimov Omurbekov Asanov Mamytov Duishonbiev Uulu"
  ),
  persian: P(
    "Mohammad Ali Reza Amir Hossein Mehdi Hamid Saeed Behzad Arman Kamran Farid Navid Babak Javad Shahin Davood Morteza Muhammad Ahmad Abdul Nasrat Javid Siyar",
    "Sara Fatemeh Zahra Maryam Nazanin Shirin Leila",
    "Mohammadi Hosseini Ahmadi Rezaei Moradi Karimi Jafari Rahimi Hashemi Mousavi Ghasemi Sadeghi Bahrami Akbari Nazari Soltani Zamani Mahmoudi Yazdani Alizadeh Rahmani Hakimi Sultani Haidari Karimzada Nazari Sharifi Abbasi Kazemi Ebrahimi"
  ),
  turkish: P(
    "Mehmet Mustafa Ahmet Ali Hüseyin Hasan İbrahim Emre Burak Murat Can Kerem Yusuf Ömer Enes Emir Furkan Serkan Onur Oğuzhan Baran Kaan Arda Batuhan",
    "Ayşe Fatma Zeynep Elif Merve Büşra Esra Selin",
    "Yılmaz Kaya Demir Şahin Çelik Yıldız Yıldırım Öztürk Aydın Özdemir Arslan Doğan Kılıç Aslan Çetin Kara Koç Kurt Özkan Şimşek Polat Korkmaz Çakır Erdoğan Güneş Aktaş Tekin Bulut Kaplan Turan Ekici Can Uçar"
  ),
  arabic: P(
    "Mohammed Ahmed Ali Omar Youssef Khalid Hamza Ibrahim Abdullah Mahmoud Mustafa Tarek Karim Amine Rachid Nabil Samir Walid Bilal Anas Zakaria Ayoub Mehdi Faisal Saleh Sultan Hassan Hussein Ismail Majid Rami Fares Ziad Adnan Belal",
    "Fatima Aisha Mariam Nour Sara Layla Yasmin Amira Salma Hana Zainab",
    "Al-Mansouri Al-Hashimi Al-Qahtani Al-Otaibi Al-Shamsi Haddad Khoury Nasser Saleh Hassan Hussein Ibrahim Mahmoud Mustafa Abdallah Benali Bouzid El_Amrani Benjelloun Alaoui Idrissi Bennani Tazi Chaoui Belkacem Saadi Mansour Darwish Farouk Hamdan Khalil Najjar Qasim Rahman Sabbagh Yassin Zaki Barakat Fakhoury Omari Toumi Jaziri Harbi Dosari"
  ),
  hebrew: P(
    "Noam Itai Yonatan Omer Ariel Eitan Daniel Ido Amit Yosef Avi Natan Lior Ron Gal",
    "Noa Tamar Maya Shira Yael Michal",
    "Cohen Levi Mizrahi Peretz Biton Dahan Avraham Friedman Azulay Malka Katz Ben-David Shapiro Goldberg Rosen Klein"
  ),
  southasian: P(
    "Arjun Rahul Vikram Aditya Rohan Karan Amit Sanjay Ravi Harpreet Gurpreet Manpreet Jaspreet Ali Bilal Usman Hamza Faisal Imran Shahzaib Anshul Ritu Bharat",
    "Priya Ananya Pooja Neha Riya Simran Ritu Puja",
    "Sharma Singh Kumar Patel Gupta Verma Yadav Reddy Rao Nair Mehta Joshi Malik Khan Ahmed Hussain Qureshi Butt Chaudhry Sandhu Gill Dhillon Grewal Jakhar Bhullar Kandola"
  ),
  japanese: P(
    "Haruto Yuto Sota Yuki Ren Kaito Takumi Riku Daiki Shota Kenta Yusuke Takeshi Kazuki Ryo Tatsuro Kyoji Kai Rei Yoshihiro Naoki Hiroto Taiga Shinya Jun Kosuke Tomoya Daichi Ryuto",
    "Yui Sakura Hina Aoi Rin Miyu Mei Saori Ayaka Kanako Mizuki Erika",
    "Sato Suzuki Takahashi Tanaka Watanabe Ito Yamamoto Nakamura Kobayashi Kato Yoshida Yamada Sasaki Yamaguchi Matsumoto Inoue Kimura Hayashi Shimizu Yamazaki Mori Abe Ikeda Hashimoto Ishikawa Ogawa Okada Maeda Fujita Goto Hasegawa Murakami Kondo Ishii Sakamoto Endo Aoki Fujii Nishimura Fukuda Ota Miura Okamoto Matsuda Nakagawa Horiguchi Taira Asakura Hiraga Ozaki"
  ),
  korean: P(
    "Min-jun Seo-jun Do-yun Ji-ho Ha-jun Jun-seo Hyun-woo Ji-hoon Sung-min Dong-hyun Jae-won Tae-hyun Chan-sung Doo-ho Jung-yong Seung-woo Kyung-ho Da-un Hyun-sung Joo-sang",
    "Seo-yeon Ji-woo Ha-eun Min-seo Soo-ah Ye-jin Ji-yeon Yu-na",
    "Kim Lee Park Choi Jung Kang Cho Yoon Jang Lim Han Oh Seo Shin Kwon Hwang Ahn Song Yoo Hong Jeon Ko Moon Yang Son Bae Baek Heo Nam"
  ),
  chinese: P(
    "Wei Jun Hao Lei Jie Tao Peng Bin Chao Long Yang Kang Feng Qiang Liang Ming Hui Song Zhen Xin Yan Kai Rui Bo Tian Jiahao Zihao Haoran Yuxuan Mingze Wuliji",
    "Li Yan Weili Jing Xiaonan Yi Na Ting Xue Mei Lina Rong Jiayi",
    "Wang Li Zhang Liu Chen Yang Zhao Huang Zhou Wu Xu Sun Hu Zhu Gao Lin He Guo Ma Luo Liang Song Zheng Xie Han Tang Feng Yu Dong Xiao Cheng Cao Yuan Deng Xu Fu Shen Zeng Peng Lu Su Lu Jiang Cai Jia Ding Wei Xue Ye Yan Pan Du Dai Xia Zhong Tian Ren Fan Fang Shi Yao Tan Liao Zou Xiong Jin Hao Kong Bai Cui Kang Mao Qiu Qin Gu Hou Shao Meng Long Wan Duan Lei Qian Tang Yin Li Jiang Yi"
  ),
  mongolian: P(
    "Batbayar Ganbold Erdene Tumur Bat-Erdene Enkhbold Munkh-Orgil Sukhbaatar Temuujin Ochir Tsogt Byambaa Gantulga Dorj Bayarsaikhan Altangerel Ankhbayar",
    "Oyuun Narantsetseg Enkhjargal Altantsetseg Solongo",
    "Batbold Ganzorig Erdenebat Tsogtbaatar Dorjsuren Bayarmagnai Munkhbat Enkhtaivan Otgonbaatar Purevdorj Sukhbat Altankhuyag Tumenbayar Battulga Ochirbat Gankhuyag Erdenebileg Bat-Ochir"
  ),
  filipino: P(
    "Juan Jose Mark John Paul Christian Rodel Joshua Ramon Eduardo Rolando Danilo Kevin Ryan Michael Jeremy Kevin Edward Honorio Jhanlo Geje Rolando Stephen",
    "Maria Angel Princess Kristine Jasmine Joy Denice Gina",
    "Santos Reyes Cruz Bautista Ocampo Garcia Mendoza Torres Tomas Andrada Castillo Flores Villanueva Ramos Castro Rivera Aquino Navarro Salazar Mercado Dela_Cruz Del_Rosario Belingon Folayang Eustaquio Gonzales Pacio Sangiao Kingad"
  ),
  thai: P(
    "Somchai Somsak Prasert Anan Wichai Sombat Chaiwat Thanawat Kittisak Nattapong Pongsak Rattana Saenchai Buakaw Rodtang Superlek Tawanchai Petchmorakot Nong-O Sitthichai Yodsanklai Jakkrit",
    "Malee Siriporn Ratana Wanida Kanokwan Supaporn Loma",
    "Saetang Srisuk Chaiyaphum Phromsri Kaewmanee Boonmee Thongsuk Wongsawat Siriwat Chaisiri Sor_Rungvisai Kiatmoo9 Por_Pramuk Sitmonchai Jitmuangnon Singha_Mawynn Kiatbusaba Petchyindee"
  ),
  vietnamese: P(
    "Minh Anh Duc Hung Tuan Huy Long Nam Quang Thanh Khoa Phuc Dat Bao Vinh Trung Son Hai Cuong",
    "Linh Lan Mai Huong Ngoc Trang Thao",
    "Nguyen Tran Le Pham Hoang Huynh Phan Vu Vo Dang Bui Do Ho Ngo Duong Ly Truong Dinh"
  ),
  malay: P(
    "Muhammad Ahmad Agus Budi Dedi Eko Fajar Hendra Indra Joko Rizky Rudi Yusuf Irfan Ilham Aiman Faiz Hafiz Zul Azlan Jeka Priscilla Adi Bayu",
    "Siti Nur Dewi Putri Ayu Ratna Fitri Intan",
    "Saputra Wijaya Pratama Santoso Kusuma Hidayat Setiawan Nugroho Gunawan Halim Susanto Lubis Harahap Simanjuntak Siregar Sitompul Nasution Ibrahim Rahman Abdullah Ismail Hassan Othman Yusof Saragih"
  ),
  burmese: P(
    "Aung Kyaw Min Zaw Htet Thura Win Naing Soe Myo Hla Thant Ko Joshua Saw Lian",
    "Thandar Nandar Su Hnin Ei",
    "Aung Kyaw Htun Win Oo Naing Soe Thant Lwin Moe Myint Zaw Van Thang Lian"
  ),
  westafrican: P(
    "Chukwuemeka Oluwaseun Adebayo Tunde Kayode Emeka Chinedu Ifeanyi Obinna Segun Kelechi Uchenna Babatunde Femi Kwame Kofi Kwabena Yaw Kojo Abiodun Israel Kamaru Sodiq Ikenna Tobi Dayo Olumide",
    "Ngozi Chioma Adaeze Funmilayo Yetunde Amaka Abena Akosua Efua",
    "Okafor Okonkwo Adeyemi Oladipo Balogun Eze Nwosu Obi Adesanya Usman Ogunleye Afolabi Bakare Chukwu Nwankwo Ojo Oyelaran Ilesanmi Mensah Boateng Owusu Asante Appiah Ofori Darko Agyeman Danso Akinola Oyeniyi Onuoha"
  ),
  francoafrican: P(
    "Francis Jean Patrick Serge Yannick Hervé Christian Didier Moussa Mamadou Ousmane Ibrahima Cheikh Abdoulaye Modou Aliou Samba Babacar Pape Lamine Oumar Seydou Boubacar Ciryl Bruno Salif Cedric",
    "Aminata Fatou Awa Mariama Aïssatou Ndeye Clarisse",
    "Ngannou Mbeumo Ndong Ekambi Tchoupo Nkoulou Fotso Kamga Diallo Ndiaye Diop Fall Sow Gueye Sarr Ba Cissé Mbaye Faye Seck Camara Traoré Koné Coulibaly Touré Kaba Kabongo Mukendi Kalonji Tshibanda Mbuyi Ilunga Lukaku Mampuya Doumbé Saïd Nzechukwu"
  ),
  southafrican: P(
    "Thabo Sipho Themba Bongani Mandla Lwazi Sibusiso Lungile Dricus Pieter Johan Jaco Ruan Wian Francois Kevin Brendon Ricardo Tapiwa Tafadzwa Farai Tendai Takudzwa Nkosi",
    "Thandi Nomvula Zanele Lerato Busisiwe Anri Chanel",
    "Nkosi Dlamini Ndlovu Khumalo Mthembu Zulu Mokoena Mahlangu Sithole Ngcobo Botha Van_der_Merwe Du_Plessis Pretorius Steyn Van_Zyl Venter Coetzee Nel Kruger Du_Preez Moyo Chikwanha Mapfumo Ncube Sibanda"
  ),
  eastafrican: P(
    "Brian Kevin Dennis Collins Victor Felix Moses Daniel Joseph Hassan Juma Baraka Otieno Kiprono Kipchoge Mwangi",
    "Faith Mercy Wanjiru Akinyi Grace",
    "Odhiambo Otieno Mwangi Kamau Kariuki Wanjala Onyango Ochieng Kiplagat Kipruto Mutua Njoroge Okello Mugisha Nsubuga Ssali"
  ),
  polynesian: P(
    "Tai Sione Viliami Losa Tavita Junior Ioane Tevita Mikaele Semisi Pita Iosefa Taniela Paea Ruben Hemi Tama Wiremu Rawiri Nikora Israel Kai Tyson",
    "Mele Losana Ana Seini Moana Ngaio Kahu",
    "Tuivasa Tuiloma Fifita Taufa Vainikolo Mataele Tupou Fonua Faleolo Sopoaga Leota Tuilagi Fatu Ngata Tamihana Parata Te_Kanawa Waititi Hohaia Mafi Lolohea Kaufusi Pomare"
  ),
};

const NICKNAMES = [
  "The Hammer", "Bulldog", "The Assassin", "Lights Out", "The Machine", "Iron", "The Natural", "Pitbull", "The Phenom", "Showtime",
  "The Spider", "Thunder", "The Viking", "Kid Dynamite", "The Reaper", "Smokin'", "The Gentleman", "Bad Boy", "The Eagle", "Tank",
  "The Silent Assassin", "Hurricane", "Lionheart", "The Butcher", "The Sniper", "Rocky", "Cyclone", "The Professor", "Mamba", "Wolverine",
  "The Animal", "Psycho", "Samurai", "The Prodigy", "Bones", "El Toro", "The Matador", "The Panther", "Cobra", "Rhino",
  "The Beast", "Diamond", "Thug", "Stone", "The Truth", "Blessed", "Gamebred", "Chaos", "The Ghost", "Hitman",
  "The Bear", "Tiger", "Hellboy", "Platinum", "Bam Bam", "The Monster", "Mr. Wonderful", "The Ox", "Dynamite", "Sugar",
  "The Shark", "Bazooka", "The Python", "Razor", "Typhoon", "The Barbarian", "Steel", "Wildcat", "Lionness", "The Rose",
];

const FEMALE_SUFFIX: Record<string, (s: string) => string> = {
  russian: (s) => (/(ov|ev|in|yn)$/.test(s) ? s + "a" : s),
  caucasus: (s) => (/(ov|ev|in)$/.test(s) ? s + "a" : s),
  central: (s) => (/(ov|ev)$/.test(s) ? s + "a" : s),
  polish: (s) => s.replace(/ski$/, "ska").replace(/cki$/, "cka").replace(/dzki$/, "dzka"),
  czech: (s) => {
    if (/(ová|á)$/.test(s)) return s;
    if (/ý$/.test(s)) return s.replace(/ý$/, "á");
    if (/a$/.test(s)) return s.replace(/a$/, "ová");
    if (/e[kc]$/.test(s)) return s.replace(/e([kc])$/, "$1ová");
    return s + "ová";
  },
  baltic: (s) => s.replace(/as$/, "ienė").replace(/us$/, "ienė").replace(/š$/, "a").replace(/s$/, "a"),
  balkan: (s) => (/(ov|ev)$/.test(s) ? s + "a" : s),
};

export function cultureNames(culture: string): Pool {
  return NAME_POOLS[culture] ?? NAME_POOLS.anglo;
}

export function makeName(rng: Rng, culture: string, sex: Sex): { first: string; last: string } {
  const pool = cultureNames(culture);
  const first = rng.pick(sex === "F" ? pool.f : pool.m);
  let last = rng.pick(pool.l);
  if (sex === "F" && FEMALE_SUFFIX[culture]) last = FEMALE_SUFFIX[culture](last);
  return { first, last };
}

export function makeNickname(rng: Rng): string {
  return rng.pick(NICKNAMES);
}
