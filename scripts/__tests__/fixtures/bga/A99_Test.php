<?php
namespace AGR\Cards;
class A99_Test extends Card
{
  public function __construct()
  {
    $this->name = clienttranslate('Test Card');
    $this->deck = 'A';
    $this->number = 99;
    $this->category = POINTS_PROVIDER;
    $this->players = '1+';
    $this->extraVp = true;
    $this->vp = 2;
    $this->cost = [WOOD => 1, FOOD => 2];
    $this->prerequisite = clienttranslate('5 Sheep on farm');
  }
}
