<?php
namespace AGR\Cards;
class A14_Banned extends Card
{
  public function __construct()
  {
    $this->name = clienttranslate('Carpenters Hammer');
    $this->deck = 'A';
    $this->number = 14;
    $this->category = ACTIONS_BOOSTER;
    $this->players = '1+';
    $this->banned = true;
  }
}
