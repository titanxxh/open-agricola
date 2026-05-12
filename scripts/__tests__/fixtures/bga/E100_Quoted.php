<?php
namespace AGR\Cards;
class E100_Quoted extends Card
{
  public function __construct()
  {
    $this->name = clienttranslate('Quoted Category Card');
    $this->deck = 'E';
    $this->number = 100;
    $this->category = 'BONUS_POINTS_-_GET';
    $this->players = '1+';
  }
}
